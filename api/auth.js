// api/auth.js — Authentication endpoint with Google OAuth & MongoDB persistence
import { connectToDatabase } from './lib/db.js';
import { signSyncToken } from './lib/syncToken.js';

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  process.env.VITE_GOOGLE_CLIENT_ID ||
  '526877931132-kfsptmlhkieshdsej0rii0kpn5lc5q13.apps.googleusercontent.com';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { credential, mode, name, email } = body;

      // ─── Mode 1: Google OAuth Sign-In (Official ID Token) ───────────────────
      if (credential) {
        // Verify ID Token with Google's tokeninfo endpoint
        const tokenRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
        );

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          res.status(401).json({
            success: false,
            message: 'Invalid Google credential token.',
            details: errText,
          });
          return;
        }

        const payload = await tokenRes.json();

        // Verify audience matches our Client ID
        if (GOOGLE_CLIENT_ID && payload.aud !== GOOGLE_CLIENT_ID) {
          res.status(401).json({
            success: false,
            message: 'Google token audience mismatch.',
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

      // ─── Mode 2: Guest / Direct Profile Sign-In ────────────────────────────
      if (mode === 'guest' || (!credential && email)) {
        const guestEmail = email || 'viewer@streamly.io';
        const guestName = name || 'Streamly Viewer';

        try {
          const { db } = await connectToDatabase();
          const usersCol = db.collection('users');
          const userDataCol = db.collection('userData');

          const guestUser = await usersCol.findOneAndUpdate(
            { email: guestEmail },
            {
              $set: {
                email: guestEmail,
                name: guestName,
                picture: '',
                lastLogin: new Date(),
                provider: 'guest',
              },
              $setOnInsert: {
                createdAt: new Date(),
              },
            },
            { upsert: true, returnDocument: 'after' }
          );

          let userLibrary = await userDataCol.findOne({ email: guestEmail });
          if (!userLibrary) {
            const initialData = {
              email: guestEmail,
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
              id: guestUser?._id || guestUser?.value?._id,
              email: guestEmail,
              name: guestName,
              picture: '',
              provider: 'guest',
            },
            userData: {
              watchlist: userLibrary.watchlist || [],
              watchHistory: userLibrary.watchHistory || [],
              preferences: userLibrary.preferences || {},
              lastSyncedAt: userLibrary.updatedAt || new Date(),
            },
          });
          return;
        } catch (dbError) {
          // If DB is temporarily unreachable in guest mode, return successful client object
          res.status(200).json({
            success: true,
            user: { email: guestEmail, name: guestName, picture: '', provider: 'guest' },
            userData: { watchlist: [], watchHistory: [], preferences: {} },
            dbOffline: true,
            dbError: dbError?.message,
          });
          return;
        }
      }

      res.status(400).json({ success: false, message: 'Missing credential or login parameters.' });
      return;
    }

    if (req.method === 'GET') {
      const { googleId, email } = req.query || {};
      if (!googleId && !email) {
        res.status(400).json({ success: false, message: 'googleId or email query parameter is required.' });
        return;
      }

      const { db } = await connectToDatabase();
      const usersCol = db.collection('users');
      const query = googleId ? { googleId } : { email };
      const user = await usersCol.findOne(query);

      if (!user) {
        res.status(404).json({ success: false, message: 'User not found.' });
        return;
      }

      res.status(200).json({
        success: true,
        user: {
          id: user._id,
          googleId: user.googleId,
          email: user.email,
          name: user.name,
          picture: user.picture,
          lastLogin: user.lastLogin,
        },
      });
      return;
    }

    res.status(405).json({ success: false, message: 'Method not allowed.' });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error?.message || 'Internal server error in auth handler.',
    });
  }
}
