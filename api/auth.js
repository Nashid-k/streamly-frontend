// api/auth.js — Authentication endpoint with Google OAuth & MongoDB persistence
import { connectToDatabase } from './lib/db.js';
import { signSyncToken } from './lib/syncToken.js';
import { verifyGoogleIdToken } from './lib/googleVerify.js';
import { withLog } from './lib/logger.js';
import { rateLimit, tooManyRequests, clientIp } from './lib/rateLimit.js';

// No hardcoded fallback: a client id baked into the repo can never be rotated
// via env and leaks the OAuth origin pairing. Set GOOGLE_CLIENT_ID (or
// VITE_GOOGLE_CLIENT_ID) in the deployment env — auth is refused otherwise.
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default withLog(async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    if (!GOOGLE_CLIENT_ID) {
      res
        .status(503)
        .json({ success: false, message: 'Auth is not configured: set GOOGLE_CLIENT_ID in the deployment environment.' });
      return;
    }

    // Sign-in is cheap but hits Google's JWKS + Mongo — cap hammering.
    const limit = rateLimit({ key: () => `auth:${clientIp(req)}`, limit: 20, windowMs: 60_000 });
    if (!limit.ok) {
      tooManyRequests(res, limit.retryAfterSec);
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { credential } = body;

      // ─── Google OAuth Sign-In (official ID Token, verified locally) ─────────
      // Signature + iss/aud/exp are checked against Google's public JWKS in
      // verifyGoogleIdToken — no tokeninfo round-trip (dev-only + throttle-prone).
      if (credential) {
        const payload = await verifyGoogleIdToken(credential, GOOGLE_CLIENT_ID);

        if (!payload) {
          res.status(401).json({
            success: false,
            message: 'Invalid or expired Google ID token.',
          });
          return;
        }

        const googleUser = {
          googleId: payload.sub,
          email: payload.email,
          name: payload.name || payload.given_name || 'Streamly Viewer',
          picture: payload.picture || '',
          emailVerified: payload.email_verified === 'true' || payload.email_verified === true,
        };

        // Persist to MongoDB
        const { db } = await connectToDatabase();
        const usersCol = db.collection('users');
        const userDataCol = db.collection('userData');

        // Upsert user in `users` collection
        const updatedUser = await usersCol.findOneAndUpdate(
          { googleId: googleUser.googleId },
          {
            $set: {
              googleId: googleUser.googleId,
              email: googleUser.email,
              name: googleUser.name,
              picture: googleUser.picture,
              lastLogin: new Date(),
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
          },
          { upsert: true, returnDocument: 'after' }
        );

        // Fetch or initialize user's library and preferences
        let userLibrary = await userDataCol.findOne({ googleId: googleUser.googleId });
        if (!userLibrary) {
          const initialData = {
            googleId: googleUser.googleId,
            email: googleUser.email,
            watchlist: [],
            watchHistory: [],
            preferences: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await userDataCol.insertOne(initialData);
          userLibrary = initialData;
        }

        res.status(200).json({
          success: true,
          user: {
            id: updatedUser?._id || updatedUser?.value?._id,
            googleId: googleUser.googleId,
            email: googleUser.email,
            name: googleUser.name,
            picture: googleUser.picture,
            provider: 'google',
          },
          userData: {
            watchlist: userLibrary.watchlist || [],
            watchHistory: userLibrary.watchHistory || [],
            preferences: userLibrary.preferences || {},
            lastSyncedAt: userLibrary.updatedAt || new Date(),
          },
          // Proof-of-ownership for /api/sync — never exposed to other users.
          syncToken: signSyncToken(googleUser.googleId),
        });
        return;
      }

      // No guest mode and no GET /api/auth here:
      //   • Guests are local-only since Task 77 — the client never calls the
      //     backend for guest sign-in, so the old guest upsert (which could
      //     write/read another account's profile by guessing an email) is gone.
      //   • GET /api/auth was an unauthenticated profile oracle
      //     (?email= returned name/picture) that no client code called.
      res
        .status(400)
        .json({ success: false, message: 'Missing credential. POST /api/auth requires a Google ID token in `credential`.' });
      return;
    }

    res.status(405).json({ success: false, message: 'Method not allowed.' });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error?.message || 'Internal server error in auth handler.',
    });
  }
});
