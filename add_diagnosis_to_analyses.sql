-- =====================================================================
-- add_diagnosis_to_analyses.sql
--
-- Adds a `diagnosis` JSONB column to the existing `analyses` table so that
-- the new "one thing to fix" callout (Diagnosis from src/utils/
-- diagnosisTaxonomy.ts) is persisted alongside other feedback fields and
-- survives page refresh / re-visits to /analysis.
--
-- Safe to re-run (idempotent).
-- Run AFTER the deployment that adds the diagnosis-callout feature.
-- No data backfill is needed — existing rows simply have `diagnosis IS NULL`,
-- and the UI renders nothing when the field is absent.
-- =====================================================================

ALTER TABLE public.analyses
  ADD COLUMN IF NOT EXISTS diagnosis JSONB;

COMMENT ON COLUMN public.analyses.diagnosis IS
  'Optional single-pattern diagnosis from generateFeedback (see src/utils/diagnosisTaxonomy.ts). Null when no clear pattern applied.';
