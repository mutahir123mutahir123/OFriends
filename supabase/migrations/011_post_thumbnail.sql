-- ============================================================
-- LOOP — Add thumbnail_url to posts (for reel preview images)
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

ALTER TABLE posts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
