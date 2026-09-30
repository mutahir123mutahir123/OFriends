-- ============================================================
-- LOOP — Remove the Reels feature
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Reels were never a separate table: they were rows in `posts`
-- distinguished by `type = 'reel'`. This migration removes that
-- discriminator entirely, so `posts` becomes pictures only.
--
-- ⚠️ IRREVERSIBLE — run once. Step 1 permanently deletes data.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Delete every reel post.
--    ON DELETE CASCADE removes the reel's rows in:
--        likes         (001_initial_schema.sql:48)
--        comments      (001_initial_schema.sql:57)
--        saved_posts   (010_saved_posts.sql:9)
--    messages.post_id is ON DELETE SET NULL (005_share_post_in_chat.sql:7),
--    so a reel shared in chat stays in the conversation as a plain
--    message still carrying its .mp4 `media_url`.
--
--    Must run BEFORE step 2: tightening the CHECK below would fail
--    validation while reel rows still exist.
-- ------------------------------------------------------------
DELETE FROM posts WHERE type = 'reel';

-- ------------------------------------------------------------
-- 2. Drop the CHECK constraint that permits 'reel'.
--    Discovered by its definition rather than by the assumed name
--    `posts_type_check`, so this cannot silently no-op and leave a
--    stale constraint behind.
-- ------------------------------------------------------------
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.posts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%reel%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.posts DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3. Posts are pictures only from here on.
-- ------------------------------------------------------------
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_type_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_type_check CHECK (type = 'picture');

-- ------------------------------------------------------------
-- 4. Drop the reel-only poster-frame column.
--    Added by 011_post_thumbnail.sql for reel preview images;
--    picture posts never wrote it.
-- ------------------------------------------------------------
ALTER TABLE public.posts DROP COLUMN IF EXISTS thumbnail_url;

-- ============================================================
-- Note: the .mp4 / _thumb.jpg objects these posts pointed at are
-- left in the `media` storage bucket. They are no longer referenced
-- by any row and can be deleted manually from the Dashboard.
-- ============================================================
