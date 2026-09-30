-- ============================================================
-- Chat deletion — REPLICA IDENTITY FULL for DELETE events
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Make DELETE events carry the full deleted row
-- (so the real-time subscription can filter by sender/receiver)
ALTER TABLE messages REPLICA IDENTITY FULL;
