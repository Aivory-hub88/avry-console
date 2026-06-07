-- ============================================================================
-- Migration: 001_create_diagnostic_storage_tables
-- Creates the four storage tables for Aivory diagnostic, blueprint, roadmap,
-- and diagnostic context data.
--
-- Requirements: 2.1 – 2.8
-- Safe to re-run: uses IF NOT EXISTS throughout (Req 2.7)
-- No destructive operations (no DROP, no DELETE)
-- ============================================================================

-- ── Shared trigger function for updated_at (Req 2.6) ─────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Table: diagnostic_results (Req 2.1) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_results (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text        NOT NULL,
  diagnostic_id   text        NOT NULL UNIQUE,
  result_data     jsonb       NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index on organization_id (Req 2.5)
CREATE INDEX IF NOT EXISTS idx_diagnostic_results_org_id
  ON diagnostic_results (organization_id);

-- updated_at trigger (Req 2.6)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_diagnostic_results_updated_at'
  ) THEN
    CREATE TRIGGER trg_diagnostic_results_updated_at
      BEFORE UPDATE ON diagnostic_results
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ── Table: blueprints (Req 2.2) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blueprints (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text        NOT NULL,
  blueprint_id    text        NOT NULL UNIQUE,
  blueprint_data  jsonb       NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index on organization_id (Req 2.5)
CREATE INDEX IF NOT EXISTS idx_blueprints_org_id
  ON blueprints (organization_id);

-- updated_at trigger (Req 2.6)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_blueprints_updated_at'
  ) THEN
    CREATE TRIGGER trg_blueprints_updated_at
      BEFORE UPDATE ON blueprints
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ── Table: roadmaps (Req 2.3) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roadmaps (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text        NOT NULL,
  roadmap_id      text        NOT NULL UNIQUE,
  roadmap_data    jsonb       NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index on organization_id (Req 2.5)
CREATE INDEX IF NOT EXISTS idx_roadmaps_org_id
  ON roadmaps (organization_id);

-- updated_at trigger (Req 2.6)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_roadmaps_updated_at'
  ) THEN
    CREATE TRIGGER trg_roadmaps_updated_at
      BEFORE UPDATE ON roadmaps
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ── Table: diagnostic_contexts (Req 2.4) ─────────────────────────────────────
-- One context per organization (upsert key = organization_id)
CREATE TABLE IF NOT EXISTS diagnostic_contexts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text        NOT NULL UNIQUE,
  context_data    jsonb       NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index on organization_id (Req 2.5)
CREATE INDEX IF NOT EXISTS idx_diagnostic_contexts_org_id
  ON diagnostic_contexts (organization_id);

-- updated_at trigger (Req 2.6)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_diagnostic_contexts_updated_at'
  ) THEN
    CREATE TRIGGER trg_diagnostic_contexts_updated_at
      BEFORE UPDATE ON diagnostic_contexts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
