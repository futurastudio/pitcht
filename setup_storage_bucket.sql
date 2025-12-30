-- ============================================
-- Pitcht Storage Bucket Setup
-- ============================================
-- Run this in Supabase SQL Editor to set up video storage

-- 1. Create recordings storage bucket (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('recordings', 'recordings', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policies for recordings bucket

-- Policy: Users can upload their own recordings
DROP POLICY IF EXISTS "Users can upload own recordings" ON storage.objects;
CREATE POLICY "Users can upload own recordings"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Users can read their own recordings
DROP POLICY IF EXISTS "Users can read own recordings" ON storage.objects;
CREATE POLICY "Users can read own recordings"
ON storage.objects FOR SELECT
USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Service role has full access (for app operations)
DROP POLICY IF EXISTS "Service role full access to recordings" ON storage.objects;
CREATE POLICY "Service role full access to recordings"
ON storage.objects FOR ALL
USING (bucket_id = 'recordings' AND auth.role() = 'service_role');

-- Policy: Users can delete their own recordings
DROP POLICY IF EXISTS "Users can delete own recordings" ON storage.objects;
CREATE POLICY "Users can delete own recordings"
ON storage.objects FOR DELETE
USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ✅ Done! Your storage bucket is now configured.
