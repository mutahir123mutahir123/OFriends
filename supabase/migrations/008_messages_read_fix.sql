-- ============================================================
-- LOOP — Fix: allow receivers to mark messages as read
-- The original schema had no FOR UPDATE policy on messages,
-- so the "mark all read" call was silently rejected by RLS.
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

CREATE POLICY "Receivers can mark messages read"
  ON messages FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);
