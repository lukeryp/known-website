// api/leitner.js
// POST /api/leitner  { staff_id, club_slug, member_idx, box }  → upsert box state
// GET  /api/leitner?staff_id=<uuid>                            → all leitner states
// GET  /api/leitner?staff_id=<uuid>&due=1                      → only items due for review

const { getSupabase } = require('./db');

// Leitner interval schedule (days between reviews per box level)
const BOX_INTERVALS = [1, 2, 4, 8, 16, 0]; // box 5 = mastered, no next_review

function nextReviewDate(box) {
  const days = BOX_INTERVALS[box] || 0;
  if (days === 0) return null; // mastered
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const db = getSupabase();

    // ── POST — upsert box state for a member ──────────────────────────────────
    if (req.method === 'POST') {
      const { staff_id, club_slug, member_idx, box } = req.body || {};
      if (!staff_id || !club_slug || member_idx == null || box == null) {
        return res.status(400).json({ error: 'staff_id, club_slug, member_idx, box required' });
      }

      const { data: club } = await db
        .from('clubs').select('id').eq('slug', club_slug).single();
      if (!club) return res.status(404).json({ error: 'Club not found' });

      const { data, error } = await db
        .from('leitner_state')
        .upsert(
          {
            staff_id,
            club_id: club.id,
            member_idx,
            box,
            next_review: nextReviewDate(box),
            updated_at: new Date().toISOString()
          },
          { onConflict: 'staff_id,member_idx' }
        )
        .select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    // ── GET — fetch leitner states for a staff member ─────────────────────────
    if (req.method === 'GET') {
      const { staff_id, due } = req.query;
      if (!staff_id) return res.status(400).json({ error: 'staff_id required' });

      let query = db
        .from('leitner_state')
        .select('member_idx, box, next_review, updated_at')
        .eq('staff_id', staff_id);

      if (due === '1') {
        query = query.lte('next_review', new Date().toISOString());
      }

      const { data, error } = await query.order('member_idx');
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
