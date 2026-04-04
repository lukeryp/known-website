// api/config.js — Returns public Supabase config for client-side use.
// The anon key is safe to expose (Supabase RLS controls data access).
// The service key never leaves the server.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    // Not configured yet — client will fall back to localStorage-only mode
    return res.json({ configured: false });
  }

  return res.json({ configured: true, supabaseUrl, supabaseAnonKey });
};
