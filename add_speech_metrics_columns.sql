-- Add speech analysis metric columns to recordings table
-- Run this in Supabase SQL Editor

-- Add columns if they don't exist
ALTER TABLE recordings
ADD COLUMN IF NOT EXISTS words_per_minute INTEGER,
ADD COLUMN IF NOT EXISTS filler_word_count INTEGER,
ADD COLUMN IF NOT EXISTS clarity_score INTEGER,
ADD COLUMN IF NOT EXISTS pacing_score INTEGER;

-- Add comment to document the columns
COMMENT ON COLUMN recordings.words_per_minute IS 'Speaking rate in words per minute (calculated from transcript)';
COMMENT ON COLUMN recordings.filler_word_count IS 'Total count of filler words detected in transcript';
COMMENT ON COLUMN recordings.clarity_score IS 'Speech clarity score 0-100 (lower filler word ratio = higher score)';
COMMENT ON COLUMN recordings.pacing_score IS 'Speaking pace score 0-100 (ideal range 120-150 WPM)';

-- Verify the columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'recordings'
AND column_name IN ('words_per_minute', 'filler_word_count', 'clarity_score', 'pacing_score')
ORDER BY column_name;
