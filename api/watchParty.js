// api/watchParty.js — Watch Party room endpoint (create / join / state / sync / chat / leave).
//
// Rooms live in the project's existing MongoDB ('watchParties' collection) —
// no new database, no new service. Realtime is 2s client polling (Vercel
// Hobby functions cannot hold WebSockets open); the host is the single
// playback authority and every other participant follows, with drift
// correction client-side. Identity is self-claimed (nickname + random
// participantId) — a party is a friends-with-a-code surface, not an account
// surface, and participants never see anything beyond display names.
//
// Actions (all POST, JSON body):
//   create  { name, title }                          → host a new room
//   join    { code, name }                           → join an existing room
//   state   { code, participantId, sinceMsgId }      → poll (2s heartbeat; also GCs idle rooms)
//   sync    { code, participantId, playback }        → HOST ONLY playback broadcast
//   chat    { code, participantId, text }            → room message (everyone incl. host)
//   leave   { code, participantId }                  → explicit exit (host leave = room dies)
//
// Shape of a room document (capped by server/watchParty.js sanitizers):
//   { code, hostId, title { titleId, title, kind, season, episode },
//     playback { isPlaying, positionSec, updatedAt, rev },
//     participants[≤25] { participantId, name, isHost, joinedAt, lastSeenAt },
//     messages[≤200] { id, participantId, name, text, at }, createdAt, updatedAt }

import { connectToDatabase } from '../server/db.js';
import { withLog } from '../server/logger.js';
import { rateLimit, tooManyRequests, clientIp } from '../server/rateLimit.js';
import {
  generatePartyCode,
  refreshHeartbeat,
  sanitizeMessage,
  sanitizeName,
  sanitizeParticipant,
  sanitizePlayback,
  sanitizeTitle,
  isRoomExpired,
  publicRoomShape,
  MAX_PARTICIPANTS,
  MAX_MESSAGES,
} from '../server/watchParty.js';

const COLLECTION = 'watchParties';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function badRequest(res, message) {
  res.status(400).json({ success: false, message });
}

function notFound(res, message) {
  res.status(404).json({ success: false, message });
}

function asTrimmed(value, maxChars) {
  if (typeof value !== 'string') return '';
  return value.slice(0, maxChars).trim();
}

// A party code is accepted as-typed: the generator excludes ambiguous glyphs,
// but a code someone reads aloud ("my code is two-A") may arrive lowercase.
function normalizeCode(raw) {
  return asTrimmed(raw, 12).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

// Mongo update with an expiry guard in the WHERE clause: a room that idle-
// expired between two polls is dead to every writer, not just to the reader.
function roomFilter(code) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return { code, updatedAt: { $gte: new Date(cutoff) } };
}

// Load a room, drop it when expired. Returns null for unknown AND expired —
// both mean "code no longer usable" to the client.
async function loadLiveRoom(col, code) {
  const room = await col.findOne({ code });
  if (!room) return null;
  if (isRoomExpired(room)) {
    await col.deleteOne({ code });
    return null;
  }
  return room;
}

export default withLog(async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed.' });
    return;
  }

  // 120/min: the client state-poll runs every 2s while a party is open, so a
  // single viewer legitimately generates ~30 hits/min; 120 leaves chat and
  // sync headroom while still capping abuse per IP.
  const limit = rateLimit({ key: () => `party:${clientIp(req)}`, limit: 120, windowMs: 60_000 });
  if (!limit.ok) {
    tooManyRequests(res, limit.retryAfterSec);
    return;
  }

  let body = null;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
  } catch {
    badRequest(res, 'Invalid JSON body.');
    return;
  }

  const action = asTrimmed(body.action, 16);
  const db = await connectToDatabase();
  const col = db.db.collection(COLLECTION);

  // Best-effort TTL index: MongoDB itself reaps idle rooms on top of the
  // read-path GC, in case a room's traffic stops entirely.
  try {
    await col.createIndex({ updatedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });
  } catch {
    // Index creation is an optimization, never a request gate.
  }

  switch (action) {
    case 'create': {
      const name = sanitizeName(body.name);
      const title = sanitizeTitle(body.title);
      const participantId = asTrimmed(body.participantId, 64);
      if (!participantId) {
        badRequest(res, 'participantId is required.');
        return;
      }
      const now = Date.now();
      const host = sanitizeParticipant(
        { participantId, name, joinedAt: now },
        { isHost: true },
      );
      // Codes are 6 chars over a 32-symbol alphabet — collisions are rare but
      // possible; retry a handful of times before giving up.
      let code = null;
      for (let attempt = 0; attempt < 5 && !code; attempt += 1) {
        const candidate = generatePartyCode();
        const clash = await col.findOne({ code: candidate }, { projection: { _id: 1 } });
        if (!clash) code = candidate;
      }
      if (!code) {
        res.status(503).json({ success: false, message: 'Could not allocate a party code — try again.' });
        return;
      }
      const room = {
        code,
        hostId: participantId,
        title,
        playback: { isPlaying: false, positionSec: 0, updatedAt: now, rev: 0 },
        participants: [host],
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
      await col.insertOne(room);
      res.status(200).json({ success: true, room: publicRoomShape(room) });
      return;
    }

    case 'join': {
      const code = normalizeCode(body.code);
      if (code.length !== 6) {
        badRequest(res, 'Enter the 6-character party code.');
        return;
      }
      const participantId = asTrimmed(body.participantId, 64);
      if (!participantId) {
        badRequest(res, 'participantId is required.');
        return;
      }
      const room = await loadLiveRoom(col, code);
      if (!room) {
        notFound(res, 'No live party with that code — check it or ask the host to create one.');
        return;
      }
      const existing = (room.participants || []).find((p) => p.participantId === participantId);
      if (!existing && (room.participants || []).length >= MAX_PARTICIPANTS) {
        res.status(409).json({ success: false, message: 'This party is full (25 participants max).' });
        return;
      }
      const name = sanitizeName(body.name);
      const now = Date.now();
      if (existing) {
        // Rejoin (refresh, network blip): refresh the heartbeat and allow a
        // rename, never duplicate the seat.
        await col.updateOne(
          { code, 'participants.participantId': participantId },
          {
            $set: {
              'participants.$.name': name,
              'participants.$.lastSeenAt': now,
              updatedAt: now,
            },
          },
        );
      } else {
        const participant = sanitizeParticipant({ participantId, name, joinedAt: now });
        await col.updateOne(
          { code },
          {
            $push: { participants: participant },
            $set: { updatedAt: now },
          },
        );
      }
      const fresh = await col.findOne({ code });
      res.status(200).json({ success: true, room: publicRoomShape(fresh) });
      return;
    }

    case 'state': {
      const code = normalizeCode(body.code);
      const participantId = asTrimmed(body.participantId, 64);
      if (!code || !participantId) {
        badRequest(res, 'code and participantId are required.');
        return;
      }
      const room = await loadLiveRoom(col, code);
      if (!room) {
        notFound(res, 'Party closed — the host left or the room expired.');
        return;
      }
      const isMember = (room.participants || []).some((p) => p.participantId === participantId);
      if (!isMember) {
        res.status(403).json({ success: false, message: 'You are not in this party.' });
        return;
      }
      const now = Date.now();
      // Heartbeat + prune: the poller is alive by definition, so its own
      // seat (name included) is always kept — only other silent seats past
      // 90s drop off the roster.
      const pruned = refreshHeartbeat(room.participants, participantId, now);
      await col.updateOne(
        { code },
        {
          $set: {
            participants: pruned,
            updatedAt: now,
          },
        },
      );
      // Chat cursor: only messages newer than the client's last-seen id go
      // back, so a 2s poll never re-downloads the whole transcript.
      const sinceMsgId = Number(body.sinceMsgId) || 0;
      const roomAfter = { ...room, participants: pruned, updatedAt: now };
      const shaped = publicRoomShape(roomAfter);
      if (sinceMsgId > 0) {
        shaped.messages = shaped.messages.filter((m) => m.id > sinceMsgId);
      }
      res.status(200).json({ success: true, room: shaped });
      return;
    }

    case 'sync': {
      const code = normalizeCode(body.code);
      const participantId = asTrimmed(body.participantId, 64);
      if (!code || !participantId) {
        badRequest(res, 'code and participantId are required.');
        return;
      }
      const room = await loadLiveRoom(col, code);
      if (!room) {
        notFound(res, 'Party closed.');
        return;
      }
      // Host-only playback control — the decision recorded in task.md. Every
      // other participant's sync is accepted as a no-op so a lost/stale guest
      // cannot fight the host over playback state.
      if (room.hostId !== participantId) {
        res.status(403).json({ success: false, message: 'Only the host controls playback.' });
        return;
      }
      const playback = sanitizePlayback(body.playback);
      if (!playback) {
        badRequest(res, 'playback state is required.');
        return;
      }
      const now = Date.now();
      await col.updateOne(
        roomFilter(code),
        {
          $set: {
            playback,
            // Title changes (host picks another episode/movie) ride sync too.
            ...(sanitizeTitle(body.title) ? { title: sanitizeTitle(body.title) } : {}),
            updatedAt: now,
          },
        },
      );
      res.status(200).json({ success: true });
      return;
    }

    case 'chat': {
      const code = normalizeCode(body.code);
      const participantId = asTrimmed(body.participantId, 64);
      if (!code || !participantId) {
        badRequest(res, 'code and participantId are required.');
        return;
      }
      const text = sanitizeMessage(body.text);
      if (!text) {
        badRequest(res, 'Message cannot be empty.');
        return;
      }
      const room = await loadLiveRoom(col, code);
      if (!room) {
        notFound(res, 'Party closed.');
        return;
      }
      const sender = (room.participants || []).find((p) => p.participantId === participantId);
      if (!sender) {
        res.status(403).json({ success: false, message: 'You are not in this party.' });
        return;
      }
      const messages = [...(room.messages || []), {
        // Monotonic numeric id = chat cursor + stable React key + ordering.
        id: (room.messages || []).length > 0
          ? (room.messages || [])[(room.messages || []).length - 1].id + 1
          : 1,
        participantId,
        name: sender.name || 'Guest',
        text,
        at: Date.now(),
      }].slice(-MAX_MESSAGES);
      const now = Date.now();
      await col.updateOne(roomFilter(code), {
        $set: {
          messages,
          updatedAt: now,
          'participants.$[p].lastSeenAt': now,
        },
        arrayFilters: [{ 'p.participantId': participantId }],
      });
      res.status(200).json({ success: true, id: messages[messages.length - 1].id });
      return;
    }

    case 'leave': {
      const code = normalizeCode(body.code);
      const participantId = asTrimmed(body.participantId, 64);
      if (!code || !participantId) {
        badRequest(res, 'code and participantId are required.');
        return;
      }
      const room = await loadLiveRoom(col, code);
      if (!room) {
        // Already gone — leaving twice is a no-op, not an error.
        res.status(200).json({ success: true });
        return;
      }
      if (room.hostId === participantId) {
        // Host leaving ends the party for everyone — the room's playback
        // authority is gone, so an orphaned room would be a frozen picture.
        await col.deleteOne({ code });
      } else {
        await col.updateOne(
          { code },
          {
            $pull: { participants: { participantId } },
            $set: { updatedAt: Date.now() },
          },
        );
      }
      res.status(200).json({ success: true });
      return;
    }

    default:
      badRequest(res, 'Unknown action.');
  }
});
