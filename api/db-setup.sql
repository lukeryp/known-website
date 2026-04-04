-- Known App — Supabase Schema
-- Run this in the Supabase SQL editor for your project.
-- Enables multi-club scaling and server-side analytics.

-- ── Clubs ─────────────────────────────────────────────────────────────────────
CREATE TABLE clubs (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug       TEXT UNIQUE NOT NULL, -- e.g. 'interlachen'
  name       TEXT NOT NULL,
  pin        TEXT,                  -- bcrypt-hashed PIN for basic access
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed Interlachen
INSERT INTO clubs (slug, name) VALUES ('interlachen', 'Interlachen Country Club');

-- ── Staff profiles per club ────────────────────────────────────────────────────
CREATE TABLE staff (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id    UUID REFERENCES clubs(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT,
  email      TEXT,
  phone      TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(club_id, name)
);

-- ── Quiz progress per staff member ────────────────────────────────────────────
-- One row per quiz answer (append-only log; good for analytics).
CREATE TABLE quiz_progress (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id    UUID REFERENCES staff(id) ON DELETE CASCADE,
  club_id     UUID REFERENCES clubs(id) ON DELETE CASCADE,
  member_idx  INTEGER NOT NULL,
  mode        TEXT NOT NULL CHECK (mode IN ('mc', 'recall', 'production')),
  correct     BOOLEAN NOT NULL,
  response_ms INTEGER,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Leitner box state per staff per member ────────────────────────────────────
-- One row per (staff, member) pair; updated in place.
CREATE TABLE leitner_state (
  staff_id    UUID REFERENCES staff(id) ON DELETE CASCADE,
  club_id     UUID REFERENCES clubs(id) ON DELETE CASCADE,
  member_idx  INTEGER NOT NULL,
  box         INTEGER DEFAULT 0 CHECK (box >= 0 AND box <= 5),
  next_review TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (staff_id, member_idx)
);

-- ── Event assignments ─────────────────────────────────────────────────────────
CREATE TABLE event_assignments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id     UUID REFERENCES clubs(id) ON DELETE CASCADE,
  event_id    TEXT NOT NULL,           -- ForeTees event id, e.g. 'ft_12345'
  staff_id    UUID REFERENCES staff(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES staff(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(club_id, event_id, staff_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX idx_quiz_progress_staff   ON quiz_progress(staff_id);
CREATE INDEX idx_quiz_progress_club    ON quiz_progress(club_id);
CREATE INDEX idx_quiz_progress_created ON quiz_progress(created_at DESC);
CREATE INDEX idx_leitner_staff         ON leitner_state(staff_id);
CREATE INDEX idx_leitner_review        ON leitner_state(next_review);
CREATE INDEX idx_event_assignments_club ON event_assignments(club_id);
CREATE INDEX idx_event_assignments_staff ON event_assignments(staff_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Enable RLS on all tables (reads/writes go through the service-key API, so
-- these policies lock down direct anon access while leaving the API open).
ALTER TABLE clubs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff             ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_progress     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leitner_state     ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_assignments ENABLE ROW LEVEL SECURITY;

-- Service key bypasses RLS, so all API routes work fine.
-- Anon key has no access (data flows through serverless API only).
