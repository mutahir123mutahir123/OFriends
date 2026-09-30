-- ============================================================
-- LOOP — Instants Feature
-- Ephemeral photos shared with friends, expire after 24h,
-- each viewer sees each instant once.
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. INSTANTS table
CREATE TABLE instants (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  media_url  TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. INSTANT_VIEWS table  (tracks who has seen each instant)
CREATE TABLE instant_views (
  instant_id UUID REFERENCES instants(id) ON DELETE CASCADE NOT NULL,
  viewer_id  UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  viewed_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (instant_id, viewer_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE instants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE instant_views ENABLE ROW LEVEL SECURITY;

-- instants: everyone can read (client filters by follows),
--           only the owner can insert / delete
CREATE POLICY "Instants are public"
  ON instants FOR SELECT USING (true);

CREATE POLICY "Users can post instants"
  ON instants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own instants"
  ON instants FOR DELETE
  USING (auth.uid() = user_id);

-- instant_views: viewer can insert their own view;
--               viewer OR instant-owner can read
CREATE POLICY "Users can mark viewed"
  ON instant_views FOR INSERT
  WITH CHECK (auth.uid() = viewer_id);

CREATE POLICY "Users can read relevant views"
  ON instant_views FOR SELECT
  USING (
    auth.uid() = viewer_id
    OR EXISTS (
      SELECT 1 FROM instants
      WHERE instants.id = instant_id
        AND instants.user_id = auth.uid()
    )
  );

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE instants;
