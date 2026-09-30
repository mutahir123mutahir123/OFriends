-- ============================================================
-- LOOP — Instant Reactions
-- Adds emoji reaction column to instant_views so viewers can
-- react to instants they watch.
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Add emoji column (null = viewed with no reaction)
ALTER TABLE instant_views
  ADD COLUMN IF NOT EXISTS emoji TEXT;

-- Allow viewers to UPDATE their own view row (to set/change emoji)
CREATE POLICY "Viewers can update own view"
  ON instant_views FOR UPDATE
  USING  (auth.uid() = viewer_id)
  WITH CHECK (auth.uid() = viewer_id);
