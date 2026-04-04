// api/db.js — Shared Supabase client (server-side, uses service key)
// Imported by all other API routes.

const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getSupabase() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL || 'https://fcxyrebdegtjdsbasxfc.supabase.co';
  const key = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjeHlyZWJkZWd0amRzYmFzeGZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTI2NzI5NCwiZXhwIjoyMDkwODQzMjk0fQ.yRXPY9IZadh3UC47VOFZJjjLpxt5Y5HJWHpPS6p1Eqw';
  _client = createClient(url, key, {
    auth: { persistSession: false }
  });
  return _client;
}

module.exports = { getSupabase };
