-- ============================================================
-- FIX: Forgot Password — backfill emails & RPC existence check
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Backfill profiles.email from auth.users for EXISTING users
--    (the column was added recently, so old profiles have NULL email)
UPDATE profiles p
SET email = au.email
FROM auth.users au
WHERE p.id = au.id
  AND p.email IS NULL;

-- 2. Create a SECURITY DEFINER function so the frontend can check
--    email existence against auth.users (not accessible client-side)
CREATE OR REPLACE FUNCTION check_email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE email = p_email);
$$;
