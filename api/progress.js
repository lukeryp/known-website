// api/progress.js
// POST /api/progress  { staff_id, club_slug, member_idx, mode, correct, response_ms }
// GET  /api/progress?staff_id=<uuid>  → all progress rows for a staff member

const { getSupabase } = require('./db');

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

    // ── POST — record a quiz answer ───────────────────────────────────────────
    if (req.method === 'POST') {
      const { staff_id, club_slug, member_idx, mode, correct, response_ms } = req.body || {};
      if (!staff_id || !club_slug || member_idx == null || !mode || correct == null) {
        return res.status(400).json({ error: 'staff_id, club_slug, member_idx, mode, correct required' });
      }

      const { data: club } = await db
        .from('clubs').select('id').eq('slug', club_slug).single();
      if (!club) return res.status(404).json({ error: 'Club not found' });

      const { data, error } = await db
        .from('quiz_progress')
        .insert({ staff_id, club_id: club.id, member_idx, mode, correct, response_ms: response_ms || null })
        .select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }

    // ── GET — fetch progress for a staff member ───────────────────────────────
    if (req.method === 'GET') {
      const { staff_id } = req.query;
      if (!staff_id) return res.status(400).json({ error: 'staff_id required' });

      const { data, error } = await db
        .from('quiz_progress')
        .select('member_idx, mode, correct, response_ms, created_at')
        .eq('staff_id', staff_id)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
