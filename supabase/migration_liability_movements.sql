-- Migration: Add liability_movements table and update liabilities
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run

-- 1. Add new columns to liabilities table
ALTER TABLE liabilities ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
ALTER TABLE liabilities ADD COLUMN IF NOT EXISTS paid_date DATE;

-- 2. Create liability_movements table
CREATE TABLE IF NOT EXISTS liability_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  liability_id UUID REFERENCES liabilities(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL CHECK (type IN ('initial', 'payment', 'increase', 'interest')),
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT DEFAULT '',
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE liability_movements ENABLE ROW LEVEL SECURITY;

-- 4. RLS policy
CREATE POLICY "Users own liability_movements" ON liability_movements
  FOR ALL USING (auth.uid() = user_id);

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_liability_movements_liability_id ON liability_movements(liability_id);
CREATE INDEX IF NOT EXISTS idx_liability_movements_user_id ON liability_movements(user_id);
CREATE INDEX IF NOT EXISTS idx_liability_movements_date ON liability_movements(date);
CREATE INDEX IF NOT EXISTS idx_liabilities_archived ON liabilities(archived);
