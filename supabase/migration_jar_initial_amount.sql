-- Migration: Add initial_amount to piggy_banks
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run

ALTER TABLE piggy_banks ADD COLUMN IF NOT EXISTS initial_amount NUMERIC(15,2) DEFAULT 0;
