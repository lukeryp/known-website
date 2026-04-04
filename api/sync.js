// api/sync.js — Migration endpoint: pushes localStorage data up to Supabase.
//
// POST /api/sync
// Body: {
//   club_slug: 'interlachen',
//   staff_name: 'Alice',                         // profile name from localStorage
//   leitner: { "42": 3, "107": 1, ... },         // member_idx → box
//   history: [{ memberIdx, mode, correct, ms, ts }, ...],  // quiz log
//   assignments: { "Alice": ["ft_123", "ft_456"], ... }    // staffKey → eventIds
// }
//
// Returns: { staff_id, leitnerSynced, historySynced, assignmentsSynced }

const { getSupabase } = require('./db');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Resolve or create a staff record, returning its UUID
async function resolveStaff(db, clubId, name) {
  const { data: existing } = await db
    .from('staff').select('id').eq('club_id', clubId).eq('name', name).maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await db
    .from('staff').insert({ club_id: clubId, name }).select('id').single();
  if (error) throw new Error('Failed to create staff: ' + error.message);
  return created.id;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const db = getSupabase();
    const { club_slug, staff_name, leitner, history, assignments } = req.body || {};

    if (!club_slug || !staff_name) {
      return res.status(400).json({ error: 'club_slug and staff_name required' });
    }

    // Resolve club
    const { data: club } = await db
      .from('clubs').select('id').eq('slug', club_slug).single();
    if (!club) return res.status(404).json({ error: 'Club not found' });

    // Resolve/create staff
    const staffId = await resolveStaff(db, club.id, staff_name);

    const result = { staff_id: staffId, leitnerSynced: 0, historySynced: 0, assignmentsSynced: 0 };

    // ── Leitner state ─────────────────────────────────────────────────────────
    if (leitner && typeof leitner === 'object') {
      const BOX_INTERVALS = [1, 2, 4, 8, 16, 0];
      const rows = Object.entries(leitner).map(([idx, box]) => {
        const days = BOX_INTERVALS[box] || 0;
        const next = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
        return { staff_id: staffId, club_id: club.id, member_idx: parseInt(idx, 10), box, next_review: next, updated_at: new Date().toISOString() };
      });
      if (rows.length) {
        const { error } = await db
          .from('leitner_state')
          .upsert(rows, { onConflict: 'staff_id,member_idx' });
        if (!error) result.leitnerSynced = rows.length;
      }
    }

    // ── Quiz history ──────────────────────────────────────────────────────────
    if (Array.isArray(history) && history.length) {
      // Batch in chunks of 500 to avoid request size limits
      const CHUNK = 500;
      let synced = 0;
      for (let i = 0; i < history.length; i += CHUNK) {
        const chunk = history.slice(i, i + CHUNK).map(h => ({
          staff_id:    staffId,
          club_id:     club.id,
          member_idx:  h.memberIdx,
          mode:        h.mode === 'mc' ? 'mc' : h.mode === 'production' ? 'production' : 'recall',
          correct:     !!h.correct,
          response_ms: h.ms || null,
          created_at:  h.ts ? new Date(h.ts).toISOString() : new Date().toISOString()
        }));
        const { error } = await db.from('quiz_progress').insert(chunk);
        if (!error) synced += chunk.length;
      }
      result.historySynced = synced;
    }

    // ── Event assignments ─────────────────────────────────────────────────────
    if (assignments && typeof assignments === 'object') {
      const rows = [];
      for (const [staffKey, eventIds] of Object.entries(assignments)) {
        if (!Array.isArray(eventIds)) continue;
        // Resolve staff by key (staffKey = name.replace(/\s+/g,'_'))
        const name = staffKey.replace(/_/g, ' ');
        let sid;
        try { sid = await resolveStaff(db, club.id, name); } catch (_) { continue; }
        for (const eventId of eventIds) {
          rows.push({ club_id: club.id, event_id: eventId, staff_id: sid });
        }
      }
      if (rows.length) {
        const { error } = await db
          .from('event_assignments')
          .upsert(rows, { onConflict: 'club_id,event_id,staff_id' });
        if (!error) result.assignmentsSynced = rows.length;
      }
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
