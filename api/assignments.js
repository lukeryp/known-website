// api/assignments.js
// GET    /api/assignments?club_slug=interlachen          → all assignments for club
// GET    /api/assignments?club_slug=interlachen&staff_id → assignments for staff member
// POST   /api/assignments  { club_slug, event_id, staff_id, assigned_by? }
// DELETE /api/assignments  { club_slug, event_id, staff_id }

const { getSupabase } = require('./db');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const db = getSupabase();

    // ── GET ───────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { club_slug, staff_id } = req.query;
      if (!club_slug) return res.status(400).json({ error: 'club_slug required' });

      const { data: club } = await db
        .from('clubs').select('id').eq('slug', club_slug).single();
      if (!club) return res.status(404).json({ error: 'Club not found' });

      let query = db
        .from('event_assignments')
        .select('id, event_id, staff_id, assigned_by, created_at')
        .eq('club_id', club.id);
      if (staff_id) query = query.eq('staff_id', staff_id);

      const { data, error } = await query.order('created_at');
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    // ── POST — assign event to staff ──────────────────────────────────────────
    if (req.method === 'POST') {
      const { club_slug, event_id, staff_id, assigned_by } = req.body || {};
      if (!club_slug || !event_id || !staff_id) {
        return res.status(400).json({ error: 'club_slug, event_id, staff_id required' });
      }

      const { data: club } = await db
        .from('clubs').select('id').eq('slug', club_slug).single();
      if (!club) return res.status(404).json({ error: 'Club not found' });

      const { data, error } = await db
        .from('event_assignments')
        .upsert(
          { club_id: club.id, event_id, staff_id, assigned_by: assigned_by || null },
          { onConflict: 'club_id,event_id,staff_id' }
        )
        .select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }

    // ── DELETE — unassign ─────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { club_slug, event_id, staff_id } = req.body || {};
      if (!club_slug || !event_id || !staff_id) {
        return res.status(400).json({ error: 'club_slug, event_id, staff_id required' });
      }

      const { data: club } = await db
        .from('clubs').select('id').eq('slug', club_slug).single();
      if (!club) return res.status(404).json({ error: 'Club not found' });

      const { error } = await db
        .from('event_assignments')
        .delete()
        .eq('club_id', club.id)
        .eq('event_id', event_id)
        .eq('staff_id', staff_id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
