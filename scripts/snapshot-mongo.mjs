// scripts/snapshot-mongo.mjs — weekly safety snapshot of the 'streamly' DB.
//
// PLAN.md P0.2: Atlas replica sets protect sync state against FAILURE, not
// against MISTAKES (a bad deploy, a fat-fingered drop). This script exports
// every collection to NDJSON under var/backups/ so the scheduled GitHub
// Actions workflow can commit the dump as a private artifact — free,
// versioned, off-cluster insurance for the one irreplaceable dataset.
//
// Usage (local or in the workflow):
//   MONGODB_URI="mongodb+srv://…" node scripts/snapshot-mongo.mjs
//   node scripts/snapshot-mongo.mjs --restore var/backups/2026-09-29/users.ndjson
//
// Requires a MongoDB URI with read (+ --restore: write) access. Kept as an
// ESM .mjs so it runs directly against the repo's mongodb driver.

import { MongoClient } from "mongodb";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const DB_NAME = "streamly";
const OUT_DIR = path.join("var", "backups");

async function snapshot() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("[snapshot] MONGODB_URI is not set — nothing to do.");
    process.exit(1);
  }
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(DB_NAME);
  const collections = await db.listCollections().toArray();
  if (collections.length === 0) {
    console.log("[snapshot] database has no collections — nothing to export.");
    await client.close();
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = path.join(OUT_DIR, stamp);
  await mkdir(dir, { recursive: true });
  let total = 0;
  for (const { name } of collections) {
    const docs = await db.collection(name).find({}).toArray();
    const file = path.join(dir, `${name}.ndjson`);
    await writeFile(file, docs.map((d) => JSON.stringify(d)).join("\n") + (docs.length ? "\n" : ""));
    total += docs.length;
    console.log(`[snapshot] ${name}: ${docs.length} doc(s) -> ${file}`);
  }
  await client.close();
  console.log(`[snapshot] done — ${total} document(s) across ${collections.length} collection(s).`);
}

async function restore(file) {
  if (!existsSync(file)) {
    console.error(`[restore] file not found: ${file}`);
    process.exit(1);
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("[restore] MONGODB_URI is not set — nothing to do.");
    process.exit(1);
  }
  const collectionName = path.basename(file).replace(/\.ndjson$/, "");
  const text = await readFile(file, "utf8");
  const docs = text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const col = client.db(DB_NAME).collection(collectionName);
  let restored = 0;
  for (const doc of docs) {
    // _id is preserved, so re-running a restore is idempotent (replace with
    // the snapshot's exact copy; upsert inserts what is missing).
    await col.replaceOne({ _id: doc._id }, doc, { upsert: true });
    restored += 1;
  }
  await client.close();
  console.log(`[restore] ${collectionName}: ${restored} document(s) written.`);
}

async function listBackups() {
  if (!existsSync(OUT_DIR)) {
    console.log("[list] no backups yet.");
    return;
  }
  for (const entry of await readdir(OUT_DIR)) {
    console.log(`[list] ${entry}`);
  }
}

const [, , command, arg] = process.argv;
if (command === "--restore" && arg) {
  await restore(arg);
} else if (command === "--list") {
  await listBackups();
} else {
  await snapshot();
}
