// src/utils/deviceData.js — export/import of device-local user data.
//
// The durability gap (PLAN.md P0.1): signed-in users' My List, watch history,
// collections and preferences are merged into MongoDB through /api/sync, but
// a GUEST's copy of the exact same state lives ONLY in localStorage — one
// "Clear site data" and it is gone. This module gives every viewer a one-file
// escape hatch: a JSON backup they can download and re-import on this or any
// other device.
//
// Scope rule (deliberate): the export covers exactly the two user-data key
// families — `aios_*` (lists, history, collections) and `setting-*`
// (preferences). It NEVER touches `streamly_*` keys, which include the Google
// session (`streamly_user`): importing someone's session file would silently
// sign the importer into a stranger's account. Auth stays device-local.

import { logDebug, logWarn } from "./debugLogger.js";

const EXPORT_PREFIXES = ["aios_", "setting-"];
const EXPORT_FORMAT = "streamly.device-data";
const EXPORT_VERSION = 1;

// Cross-tab/local listeners fire on these after an import, mirroring the
// events the cloud-sync merge path dispatches (AuthContext).
const SYNC_EVENTS = [
  "aios_sync_mylist",
  "aios_sync_cw",
  "aios_sync_collections",
  "aios_sync_preferences",
  "aios_sync_sh",
];

function isExportKey(key) {
  return EXPORT_PREFIXES.some((p) => key.startsWith(p));
}

/* Snapshot every user-data key. Values are stored raw (localStorage strings)
   so the file is byte-faithful: no parse/re-serialize can corrupt a list. */
export function exportDeviceData() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !isExportKey(key)) continue;
      const value = localStorage.getItem(key);
      if (value !== null) data[key] = value;
    }
  } catch (error) {
    // Non-DOM or blocked storage — the caller reports the failure loudly.
    logWarn("export", "Device data export failed while reading storage.", {
      message: error?.message,
    });
    throw error;
  }
  return {
    app: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    count: Object.keys(data).length,
    data,
  };
}

/* Import a previously exported file. Validates before touching anything:
   unknown shapes are refused whole (no partial imports), then each entry is
   written and the same cross-tab events the sync path uses are dispatched.
   Returns { imported, skipped } and never throws for a WRONG FILE — a
   caller-chosen file is user input, so the outcome is the return value. */
export function importDeviceData(rawJson) {
  let parsed = null;
  try {
    parsed = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
  } catch {
    return { ok: false, imported: 0, skipped: 0, reason: "not valid JSON" };
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    parsed.app !== EXPORT_FORMAT ||
    !parsed.data ||
    typeof parsed.data !== "object" ||
    Array.isArray(parsed.data)
  ) {
    return { ok: false, imported: 0, skipped: 0, reason: "not a Streamly device-data file" };
  }

  let imported = 0;
  let skipped = 0;
  try {
    for (const [key, value] of Object.entries(parsed.data)) {
      if (!isExportKey(key) || typeof value !== "string") {
        skipped += 1;
        continue;
      }
      localStorage.setItem(key, value);
      imported += 1;
    }
  } catch (error) {
    logWarn("export", "Device data import failed while writing storage.", {
      message: error?.message,
    });
    return { ok: false, imported, skipped, reason: "storage write failed" };
  }

  for (const eventName of SYNC_EVENTS) {
    try {
      window.dispatchEvent(new Event(eventName));
    } catch {
      // A blocked event dispatch must not undo a completed import.
    }
  }
  logDebug("export", "Device data imported.", { imported, skipped });
  return { ok: true, imported, skipped };
}

/* Download the snapshot as a file. Saves via the File System Access API when
   available (same pattern as downloadService), Blob <a download> otherwise. */
export async function downloadDeviceData() {
  const snapshot = exportDeviceData();
  const json = JSON.stringify(snapshot, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `streamly-backup-${date}.json`;

  if (typeof window !== "undefined" && window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(new Blob([json], { type: "application/json" }));
      await writable.close();
      return { count: snapshot.count, filename };
    } catch (error) {
      if (error?.name === "AbortError") return null; // user cancelled — not an error
      logDebug("export", "Save picker unavailable — falling back to download link.", {
        message: error?.message,
      });
    }
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { count: snapshot.count, filename };
}

/* How many user-data keys this device currently holds — powers the row's
   honest subtitle ("14 keys backed up") without dumping contents. */
export function countDeviceData() {
  let count = 0;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && isExportKey(key)) count += 1;
    }
  } catch {
    return 0;
  }
  return count;
}
