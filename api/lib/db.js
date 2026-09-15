// api/lib/db.js — MongoDB connection pooling for serverless and local environments.
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || '';
const options = {
  connectTimeoutMS: 10000,
  serverSelectionTimeoutMS: 10000,
  maxPoolSize: 10,
};

let client;
let clientPromise;

if (!uri) {
  // If MongoDB URI is not configured, we keep promise null so callers can handle gracefully
  clientPromise = Promise.reject(new Error('MONGODB_URI environment variable is not defined.'));
} else {
  if (process.env.NODE_ENV === 'development' || !process.env.VERCEL) {
    // In development or non-Vercel mode, use a global variable to preserve connection across HMR
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri, options);
      global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
  } else {
    // In production mode (Vercel serverless function), create a new client promise per cold start
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }
}

/**
 * Returns the connected MongoClient instance and 'streamly' database reference.
 */
export async function connectToDatabase(dbName = 'streamly') {
  if (!uri) {
    throw new Error('MONGODB_URI is not set in environment.');
  }
  const connectedClient = await clientPromise;
  const db = connectedClient.db(dbName);

  return { client: connectedClient, db };
}

export default clientPromise;
