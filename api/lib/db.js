// api/lib/db.js — MongoDB connection pooling for serverless and local environments.
import { MongoClient } from 'mongodb';

// Resolved lazily so a missing MONGODB_URI can NEVER crash the function at
// cold start. The old module-level `Promise.reject(...)` produced an unhandled
// rejection the instant the module was imported (Node ≥15 fatal) — every
// auth/sync/publicCollections invocation died with Vercel's plain-text
// "A server error has occurred" (FUNCTION_INVOCATION_FAILED) instead of a
// clean JSON 503 the client could surface.
function getUri() {
  return process.env.MONGODB_URI || '';
}

const options = {
  connectTimeoutMS: 10000,
  serverSelectionTimeoutMS: 10000,
  maxPoolSize: 10,
};

let clientPromise = null;
let clientPromiseUri = null;

function getClientPromise() {
  const uri = getUri();
  if (!uri) return null;
  if (clientPromise && clientPromiseUri === uri) return clientPromise;

  // New/rotated URI: pool per URI so env changes apply on the next cold start
  // without reusing a stale connection.
  clientPromise = null;
  if (process.env.NODE_ENV === 'development' || !process.env.VERCEL) {
    // In development or non-Vercel mode, use a global variable to preserve
    // connection across HMR.
    if (!global._mongoClientPromise || global._mongoClientPromiseUri !== uri) {
      const client = new MongoClient(uri, options);
      global._mongoClientPromise = client.connect();
      global._mongoClientPromiseUri = uri;
    }
    clientPromise = global._mongoClientPromise;
  } else {
    // In production mode (Vercel serverless function), create a new client
    // promise per cold start.
    clientPromise = new MongoClient(uri, options).connect();
  }
  clientPromiseUri = uri;
  return clientPromise;
}

/**
 * Returns the connected MongoClient instance and 'streamly' database reference.
 * Throws a clean Error (caught by handlers → JSON 503/500) when Mongo is not
 * configured — never crashes at import time.
 */
export async function connectToDatabase(dbName = 'streamly') {
  const uri = getUri();
  if (!uri) {
    throw new Error('MongoDB is not configured: set MONGODB_URI in the deployment environment.');
  }
  const connectedClient = await getClientPromise();
  return { client: connectedClient, db: connectedClient.db(dbName) };
}

export default getClientPromise;
