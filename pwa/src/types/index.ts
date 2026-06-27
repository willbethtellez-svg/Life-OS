export interface Account {
  id: string;
  name: string;
  type: 'asset' | 'liability' | 'revenue' | 'expense';
  currency: CurrencyCode;
  balance: number;
  balanceFormatted: string;
  initialBalance: number;
  currentBalance: number;
  active: boolean;
  virtualBalance: number;
  includeInNetWorth: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  amountFormatted: string;
  foreignAmount: number | null;
  foreignCurrency: CurrencyCode | null;
  type: TransactionType;
  sourceId: string;
  sourceName: string;
  destinationId: string;
  destinationName: string;
  categoryId: string | null;
  categoryName: string | null;
  budgetId: string | null;
  piggyBankId: string | null;
  tags: string[];
  reconciled: boolean;
  pending: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type TransactionType = 'withdrawal' | 'deposit' | 'transfer';

export type CurrencyCode = 'USD' | 'VES' | 'EUR' | 'BTC' | 'USDT';

export interface Category {
  id: string;
  name: string;
  spent: number;
  budgeted: number;
}

export interface Budget {
  id: string;
  name: string;
  active: boolean;
  budgetLimit: number;
  spent: number;
  currency: CurrencyCode;
}

export interface PiggyBank {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  currency: CurrencyCode;
  startDate: string;
  targetDate: string | null;
  notes: string;
}

export interface Liability {
  id: string;
  name: string;
  type: 'loan' | 'debt' | 'credit';
  amount: number;
  interestRate: number;
  currency: CurrencyCode;
  startDate: string;
  dueDate: string | null;
}

export interface ExchangeRate {
  date: string;
  from: CurrencyCode;
  to: CurrencyCode;
  rate: number;
  source: 'official' | 'p2p_average' | 'manual';
  transactionsUsed: number;
}

export interface PendingTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  accountId: string;
  accountName: string;
  type: TransactionType;
  categoryId: string | null;
  categoryName: string | null;
  confirmed: boolean;
  synced: boolean;
  createdAt: string;
}

export interface HouseholdTask {
  id: string;
  title: string;
  description: string;
  date: string;
  completed: boolean;
  estimatedCost: number;
  currency: CurrencyCode;
  jarId: string | null;
  jarName: string | null;
  category: 'mantenimiento' | 'limpieza' | 'reparacion' | 'compra' | 'otro';
  notes: string;
  createdAt: string;
}

export interface MaintenanceLog {
  id: string;
  date: string;
  type: string;
  description: string;
  cost: number;
  currency: CurrencyCode;
  nextDate: string | null;
  notes: string;
}

export interface VehicleRecord {
  id: string;
  date: string;
  type: 'fuel' | 'maintenance' | 'repair' | 'insurance' | 'other';
  description: string;
  mileage: number;
  cost: number;
  currency: CurrencyCode;
  nextMileage: number | null;
  nextDate: string | null;
  notes: string;
  transactionId: string | null;
}

export interface BabyRecord {
  id: string;
  date: string;
  type: 'appointment' | 'purchase' | 'milestone' | 'expense' | 'other';
  description: string;
  cost: number;
  currency: CurrencyCode;
  estimatedCost: number;
  notes: string;
  completed: boolean;
}
