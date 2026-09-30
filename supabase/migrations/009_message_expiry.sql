-- ============================================================
-- LOOP — 24-hour Message Expiry
--
-- BEFORE RUNNING:
-- 1. Enable pg_cron extension:
--    Dashboard → Database → Extensions → search "pg_cron" → Enable
--
-- 2. Then run this file in: SQL Editor → New Query
-- ============================================================

-- ── Cleanup function ──────────────────────────────────────
-- SECURITY DEFINER so it runs as the table owner and bypasses RLS.
CREATE OR REPLACE FUNCTION public.delete_expired_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.messages
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$;

-- Allow the function to be called by authenticated users
-- (cron calls it as postgres, but this keeps things tidy)
REVOKE ALL ON FUNCTION public.delete_expired_messages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_expired_messages() TO postgres;

-- ── Hourly pg_cron job ────────────────────────────────────
-- Runs at the top of every hour.
-- If a job with this name already exists, unschedule it first.
SELECT cron.unschedule('delete-expired-messages')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'delete-expired-messages'
);

SELECT cron.schedule(
  'delete-expired-messages',   -- job name
  '0 * * * *',                 -- every hour at :00
  $$SELECT public.delete_expired_messages()$$
);
