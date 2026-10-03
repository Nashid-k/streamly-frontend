// api/usage.js — read-side of the daily usage ledger (PLAN.md P0.3 / P1.4).
//
// GET only. Answers { day, scopes } from the merged Mongo ledger so the
// Settings → System status row can show "how close to the free-tier ceiling
// are we" instead of a viewer discovering a quota by playback dying.
// No auth: counts carry no user data (fixed scope tokens, no IPs, no ids) —
// the numbers are the app's own capacity, which is public by nature.
//
// Read is on-demand only (the Settings row), so this costs ~nothing; the
// write side is the batched flush in server/usage.js.

import { connectToDatabase } from '../server/db.js';

const SCOPE_BUDGETS = {
  // Daily capacity ceilings the dashboard row compares against. These mirror
  // the free-tier math in PLAN.md, not exact provider numbers.
  dl: 100_000,     // Cloudflare worker relay fragments (100k/day shared)
  tmdb: 50_000,    // TMDB proxy function hits
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed', code: 'method' });
    return;
  }

  try {
    const { db } = await connectToDatabase();
    const doc = await db.collection('usage').findOne({ _id: 'daily' });
    const day = new Date().toISOString().slice(0, 10);
    const merged = (doc && doc.days && doc.days[day]) || {};
    const scopes = {};
    for (const [scope, budget] of Object.entries(SCOPE_BUDGETS)) {
      const count = Number(merged[scope]) || 0;
      scopes[scope] = { count, budget, pct: Math.min(100, Math.round((count / budget) * 100)) };
    }
    res.setHeader('cache-control', 'no-store');
    res.status(200).json({ ok: true, day, scopes });
  } catch (error) {
    // Ledger is observability, not playback: degrade to an honest empty answer
    // so a Mongo hiccup can never break a UI that merely displays capacity.
    res.status(200).json({ ok: true, day: new Date().toISOString().slice(0, 10), scopes: {}, degraded: true, message: error?.message || 'ledger unavailable' });
  }
}
