-- ============================================================
-- Fix: make media and avatars buckets fully public so all
-- authenticated users can read video/image files.
-- Without this, only the uploader can load their own reels.
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Mark buckets as public (bypasses per-object RLS for reads)
UPDATE storage.buckets SET public = true WHERE id IN ('media', 'avatars');

-- Explicit SELECT policy so authenticated users can always read
-- (belt-and-suspenders alongside the public flag)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Authenticated users can read media'
  ) THEN
    CREATE POLICY "Authenticated users can read media"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id IN ('media', 'avatars'));
  END IF;
END;
$$;
