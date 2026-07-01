export type TransactionType = 'withdrawal' | 'deposit' | 'transfer';
export type CurrencyCode = 'USD' | 'VES' | 'EUR' | 'BTC' | 'USDT';

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: 'asset' | 'liability';
  currency: CurrencyCode;
  initial_balance: number;
  current_balance: number;
  include_in_net_worth: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  date: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  amount_usd: number;
  type: TransactionType;
  source_account_id: string | null;
  destination_account_id: string | null;
  category_id: string | null;
  piggy_bank_id: string | null;
  destination_piggy_bank_id: string | null;
  foreign_amount: number | null;
  foreign_currency: CurrencyCode | null;
  fee: number;
  fee_currency: CurrencyCode | null;
  confirmed: boolean;
  reconciled: boolean;
  notes: string;
  created_at: string;
  // Joined fields
  category_name?: string | null;
  source_name?: string | null;
  destination_name?: string | null;
  piggy_bank_name?: string | null;
  destination_piggy_bank_name?: string | null;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  name: string;
  currency: CurrencyCode;
  budget_limit: number;
  active: boolean;
  created_at: string;
}

export interface PiggyBank {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  initial_amount: number;
  currency: CurrencyCode;
  start_date: string | null;
  target_date: string | null;
  notes: string;
  created_at: string;
}

export interface Liability {
  id: string;
  user_id: string;
  name: string;
  type: 'loan' | 'debt' | 'credit';
  amount: number;
  current_balance: number;
  interest_rate: number;
  currency: CurrencyCode;
  start_date: string | null;
  due_date: string | null;
  archived: boolean;
  paid_date: string | null;
  created_at: string;
}

export interface LiabilityMovement {
  id: string;
  user_id: string;
  liability_id: string;
  date: string;
  type: 'initial' | 'payment' | 'increase' | 'interest';
  amount: number;
  currency: string;
  notes: string;
  transaction_id: string | null;
  created_at: string;
}

export interface ExchangeRate {
  id: string;
  user_id: string;
  date: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  source: 'official' | 'p2p_average' | 'manual';
  transactions_used: number;
  created_at: string;
}

export interface ReconciliationGroup {
  id: string;
  user_id: string;
  name: string;
  account_ids: string[];
  jar_ids: string[];
  created_at: string;
}

export interface AccountAcquisition {
  id: string;
  user_id: string;
  account_id: string;
  average_rate: number;
  notes: string;
  updated_at: string;
}

export interface PendingTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  accountId: string;
  accountName: string;
  destinationAccountId?: string;
  destinationAccountName?: string;
  type: TransactionType;
  categoryId: string | null;
  categoryName: string | null;
  piggyBankId?: string | null;
  piggyBankName?: string;
  destinationPiggyBankId?: string | null;
  destinationPiggyBankName?: string;
  foreignAmount?: number | null;
  foreignCurrency?: CurrencyCode | null;
  fee: number | null;
  feeCurrency: CurrencyCode | null;
  feeCategoryId: string | null;
  confirmed: boolean;
  synced: boolean;
  createdAt: string;
}

export interface HouseholdTask {
  id: string;
  user_id: string;
  title: string;
  description: string;
  date: string;
  completed: boolean;
  estimated_cost: number;
  currency: CurrencyCode;
  category: 'mantenimiento' | 'limpieza' | 'reparacion' | 'compra' | 'otro';
  notes: string;
  created_at: string;
}

export interface MaintenanceLog {
  id: string;
  user_id: string;
  date: string;
  type: string;
  description: string;
  cost: number;
  currency: CurrencyCode;
  next_date: string | null;
  notes: string;
  created_at: string;
}

export interface VehicleRecord {
  id: string;
  user_id: string;
  date: string;
  type: 'fuel' | 'maintenance' | 'repair' | 'insurance' | 'other';
  description: string;
  mileage: number;
  cost: number;
  currency: CurrencyCode;
  next_mileage: number | null;
  next_date: string | null;
  notes: string;
  transaction_id: string | null;
  created_at: string;
}

export interface BabyRecord {
  id: string;
  user_id: string;
  date: string;
  type: 'appointment' | 'purchase' | 'milestone' | 'expense' | 'other';
  description: string;
  cost: number;
  currency: CurrencyCode;
  estimated_cost: number;
  notes: string;
  completed: boolean;
  created_at: string;
}
