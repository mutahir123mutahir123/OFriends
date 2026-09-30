-- ============================================================
-- Add DELETE RLS policy for messages table
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Allow sender or receiver to delete the conversation
CREATE POLICY "Users can delete own conversations" ON messages FOR DELETE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
