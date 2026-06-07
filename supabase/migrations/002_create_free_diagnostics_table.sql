-- ============================================================================
-- Migration: 002_create_free_diagnostics_table
-- Creates a lightweight lead-capture table for free diagnostic results.
-- Stores only the minimum metadata needed for sales analytics — no answers,
-- no narrative, no strengths/blockers blob.
--
-- Safe to re-run: uses IF NOT EXISTS throughout.
-- No destructive operations (no DROP, no DELETE).
-- ============================================================================

CREATE TABLE IF NOT EXISTS free_diagnostics (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnostic_id   text        NOT NULL,
  company_name    text        NOT NULL,
  company_size    text        NOT NULL,
  industry        text        NOT NULL,
  score           integer     NOT NULL,
  maturity_level  text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index on diagnostic_id for lookups
CREATE INDEX IF NOT EXISTS idx_free_diagnostics_diagnostic_id
  ON free_diagnostics (diagnostic_id);

-- Index on created_at for analytics queries (most recent first)
CREATE INDEX IF NOT EXISTS idx_free_diagnostics_created_at
  ON free_diagnostics (created_at DESC);

-- Allow anonymous inserts (anon role) — this is a free lead capture table
-- No RLS complexity needed; anon can insert but not read/update/delete
ALTER TABLE free_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow anonymous inserts"
  ON free_diagnostics
  FOR INSERT
  TO anon
  WITH CHECK (true);
