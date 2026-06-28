-- Life OS - Supabase Schema
-- Ejecuta esto en: Supabase Dashboard → SQL Editor → New Query → Run

-- ============================================================
-- TABLAS
-- ============================================================

-- Cuentas bancarias
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('asset', 'liability')),
  currency TEXT NOT NULL DEFAULT 'USD',
  initial_balance NUMERIC(15,2) DEFAULT 0,
  current_balance NUMERIC(15,2) DEFAULT 0,
  include_in_net_worth BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Transacciones
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  type TEXT NOT NULL CHECK (type IN ('withdrawal', 'deposit', 'transfer')),
  source_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  destination_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  category_id UUID,
  piggy_bank_id UUID REFERENCES piggy_banks(id) ON DELETE SET NULL,
  destination_piggy_bank_id UUID REFERENCES piggy_banks(id) ON DELETE SET NULL,
  foreign_amount NUMERIC(15,2),
  foreign_currency TEXT,
  fee NUMERIC(15,2) DEFAULT 0,
  fee_currency TEXT DEFAULT 'USD',
  confirmed BOOLEAN DEFAULT false,
  reconciled BOOLEAN DEFAULT false,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Categorías
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Presupuestos
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  budget_limit NUMERIC(15,2) DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Jarras / Alcancías (Piggy Banks)
CREATE TABLE IF NOT EXISTS piggy_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount NUMERIC(15,2) DEFAULT 0,
  current_amount NUMERIC(15,2) DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  start_date DATE,
  target_date DATE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Préstamos / Deudas
CREATE TABLE IF NOT EXISTS liabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('loan', 'debt', 'credit')),
  amount NUMERIC(15,2) DEFAULT 0,
  current_balance NUMERIC(15,2) DEFAULT 0,
  interest_rate NUMERIC(5,2) DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  start_date DATE,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tasas de cambio
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate NUMERIC(15,6) NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('official', 'p2p_average', 'manual')),
  transactions_used INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date, from_currency, to_currency)
);

-- Account acquisition rates (for VES cost basis)
CREATE TABLE IF NOT EXISTS account_acquisition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  average_rate NUMERIC(15,6) DEFAULT 0,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, account_id)
);

-- Tareas del hogar
CREATE TABLE IF NOT EXISTS household_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  date DATE DEFAULT CURRENT_DATE,
  completed BOOLEAN DEFAULT false,
  estimated_cost NUMERIC(15,2) DEFAULT 0,
  currency TEXT DEFAULT 'VES',
  category TEXT DEFAULT 'otro' CHECK (category IN ('mantenimiento', 'limpieza', 'reparacion', 'compra', 'otro')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Registros de mantenimiento del hogar
CREATE TABLE IF NOT EXISTS maintenance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  cost NUMERIC(15,2) DEFAULT 0,
  currency TEXT DEFAULT 'VES',
  next_date DATE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Registros del vehículo
CREATE TABLE IF NOT EXISTS vehicle_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL CHECK (type IN ('fuel', 'maintenance', 'repair', 'insurance', 'other')),
  description TEXT NOT NULL,
  mileage INT DEFAULT 0,
  cost NUMERIC(15,2) DEFAULT 0,
  currency TEXT DEFAULT 'VES',
  next_mileage INT,
  next_date DATE,
  notes TEXT DEFAULT '',
  transaction_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Registros del bebé
CREATE TABLE IF NOT EXISTS baby_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL CHECK (type IN ('appointment', 'purchase', 'milestone', 'expense', 'other')),
  description TEXT NOT NULL,
  cost NUMERIC(15,2) DEFAULT 0,
  currency TEXT DEFAULT 'VES',
  estimated_cost NUMERIC(15,2) DEFAULT 0,
  notes TEXT DEFAULT '',
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_dest ON transactions(destination_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_piggy_banks_user ON piggy_banks(user_id);
CREATE INDEX IF NOT EXISTS idx_liabilities_user ON liabilities(user_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(date);
CREATE INDEX IF NOT EXISTS idx_household_tasks_user ON household_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_records_user ON vehicle_records(user_id);
CREATE INDEX IF NOT EXISTS idx_baby_records_user ON baby_records(user_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE piggy_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE liabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_acquisition ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE baby_records ENABLE ROW LEVEL SECURITY;

-- Policies: cada usuario solo ve sus datos
CREATE POLICY "Users can manage their own accounts" ON accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own transactions" ON transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own categories" ON categories FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own budgets" ON budgets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own piggy_banks" ON piggy_banks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own liabilities" ON liabilities FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own exchange_rates" ON exchange_rates FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own account_acquisition" ON account_acquisition FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own household_tasks" ON household_tasks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own maintenance_logs" ON maintenance_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own vehicle_records" ON vehicle_records FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own baby_records" ON baby_records FOR ALL USING (auth.uid() = user_id);
