// api/staff.js
// GET  /api/staff?club_slug=interlachen            → list all staff for club
// GET  /api/staff?club_slug=interlachen&name=Alice → get or create staff record
// POST /api/staff  { club_slug, name, role?, email?, phone? } → upsert staff

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

    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { club_slug, name } = req.query;
      if (!club_slug) return res.status(400).json({ error: 'club_slug required' });

      // Resolve club_id
      const { data: club, error: clubErr } = await db
        .from('clubs').select('id').eq('slug', club_slug).single();
      if (clubErr || !club) return res.status(404).json({ error: 'Club not found' });

      // If name provided: get or create
      if (name) {
        const { data: existing } = await db
          .from('staff').select('*')
          .eq('club_id', club.id).eq('name', name).maybeSingle();
        if (existing) return res.json(existing);

        // Create new staff record
        const { data: created, error: createErr } = await db
          .from('staff').insert({ club_id: club.id, name }).select().single();
        if (createErr) return res.status(500).json({ error: createErr.message });
        return res.status(201).json(created);
      }

      // List all staff for club
      const { data, error } = await db
        .from('staff').select('*').eq('club_id', club.id).order('name');
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { club_slug, name, role, email, phone } = req.body || {};
      if (!club_slug || !name) return res.status(400).json({ error: 'club_slug and name required' });

      const { data: club, error: clubErr } = await db
        .from('clubs').select('id').eq('slug', club_slug).single();
      if (clubErr || !club) return res.status(404).json({ error: 'Club not found' });

      const { data, error } = await db
        .from('staff')
        .upsert({ club_id: club.id, name, role, email, phone }, { onConflict: 'club_id,name' })
        .select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
