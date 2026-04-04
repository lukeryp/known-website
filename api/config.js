// api/config.js — Returns public Supabase config for client-side use.
// The anon key is safe to expose (Supabase RLS controls data access).
// The service key never leaves the server.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://fcxyrebdegtjdsbasxfc.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjeHlyZWJkZWd0amRzYmFzeGZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjcyOTQsImV4cCI6MjA5MDg0MzI5NH0.Ngj7SJU3jelIoqOa2t18iK3oce3d2F1EWa8IiUQAh70';

  return res.json({ configured: true, supabaseUrl, supabaseAnonKey });
};
