-- Migration: Add reconciliation_groups table (custom reconciliation cards)
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run

CREATE TABLE IF NOT EXISTS reconciliation_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_ids UUID[] NOT NULL DEFAULT '{}',
  jar_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE reconciliation_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own reconciliation_groups" ON reconciliation_groups
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reconciliation_groups_user ON reconciliation_groups(user_id);
