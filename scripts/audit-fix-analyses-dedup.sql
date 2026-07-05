-- ============================================================================
-- Finding N3 — Prevent duplicate analyses rows / double Claude spend
-- ============================================================================
--
-- PROBLEM
-- Two code paths insert into `analyses` for the same recording:
--   1. interview/page.tsx  — generates feedback in the background after each
--      recording and inserts a row.
--   2. analysis/page.tsx (via saveAnalysis) — independently generates + saves
--      if it doesn't yet see a row.
-- With no unique constraint on recording_id, a race inserts BOTH rows and bills
-- Claude twice. The application code now guards against this (checks for an
-- existing row and tolerates unique-violation 23505), but the durable fix is a
-- unique index so the DB itself enforces one analysis per recording.
--
-- ----------------------------------------------------------------------------
-- HOW TO RUN (Supabase SQL Editor)
-- ----------------------------------------------------------------------------
-- 1. Run STEP 1 to see how many duplicate groups exist today.
-- 2. Run STEP 2 to delete redundant rows, keeping the most recent per recording.
-- 3. Run STEP 3 to add the unique index. It will error if STEP 2 left any dupes.
-- 4. Run STEP 4 to confirm the index exists.
-- ============================================================================


-- STEP 1 — How many duplicates exist? (READ ONLY) ----------------------------
SELECT COUNT(*) AS duplicate_groups,
       COALESCE(SUM(cnt - 1), 0) AS redundant_rows
FROM (
  SELECT recording_id, COUNT(*) AS cnt
  FROM analyses
  GROUP BY recording_id
  HAVING COUNT(*) > 1
) s;


-- STEP 2 — Delete redundant rows, keep the newest per recording --------------
DELETE FROM analyses a
USING (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY recording_id ORDER BY created_at DESC, id DESC) AS rn
  FROM analyses
) ranked
WHERE a.id = ranked.id
  AND ranked.rn > 1;


-- STEP 3 — Enforce one analysis per recording --------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS analyses_recording_id_key
  ON analyses (recording_id);


-- STEP 4 — Verify (READ ONLY) ------------------------------------------------
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'analyses' AND indexname = 'analyses_recording_id_key';
