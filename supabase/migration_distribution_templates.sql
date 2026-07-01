-- Migration: Add distribution_templates table (batch jar-to-jar transfer templates)
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run

CREATE TABLE IF NOT EXISTS distribution_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_jar_id UUID REFERENCES piggy_banks(id) ON DELETE SET NULL,
  items JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE distribution_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own distribution_templates" ON distribution_templates
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_distribution_templates_user ON distribution_templates(user_id);
