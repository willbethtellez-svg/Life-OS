import { supabase } from '@/lib/supabase';
import type {
  Account, Transaction, Category, Budget, PiggyBank, Liability,
  ExchangeRate, AccountAcquisition, HouseholdTask, MaintenanceLog,
  VehicleRecord, BabyRecord, PendingTransaction,
} from '@/types';

async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export const db = {
  // ─── ACCOUNTS ──────────────────────────────────────────────
  accounts: {
    list: async (params?: { type?: string }): Promise<Account[]> => {
      let q = supabase.from('accounts').select('*').eq('active', true).order('name');
      if (params?.type) q = q.eq('type', params.type);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    get: async (id: string): Promise<Account | null> => {
      const { data, error } = await supabase.from('accounts').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    transactions: async (id: string, params?: { limit?: number; start?: string; end?: string }): Promise<Transaction[]> => {
      let q = supabase
        .from('transactions')
        .select('*')
        .or(`source_account_id.eq.${id},destination_account_id.eq.${id}`)
        .order('date', { ascending: false });
      if (params?.limit) q = q.limit(params.limit);
      if (params?.start) q = q.gte('date', params.start);
      if (params?.end) q = q.lte('date', params.end);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    create: async (account: Partial<Account>): Promise<Account> => {
      const user = await getUser();
      const { data, error } = await supabase.from('accounts').insert({ ...account, user_id: user?.id }).select().single();
      if (error) throw error;
      return data;
    },
    update: async (id: string, updates: Partial<Account>): Promise<Account> => {
      const { data, error } = await supabase.from('accounts').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('accounts').delete().eq('id', id);
      if (error) throw error;
    },
  },

  // ─── TRANSACTIONS ──────────────────────────────────────────
  transactions: {
    list: async (params?: { limit?: number; start?: string; end?: string; type?: string }): Promise<Transaction[]> => {
      let q = supabase.from('transactions').select('*').order('date', { ascending: false });
      if (params?.limit) q = q.limit(params.limit);
      if (params?.start) q = q.gte('date', params.start);
      if (params?.end) q = q.lte('date', params.end);
      if (params?.type) q = q.eq('type', params.type);
      const { data, error } = await q;
      if (error) throw error;
      // Enrich with category name and account names
      const enriched = await Promise.all((data || []).map(async (tx) => {
        let categoryName: string | null = null;
        let sourceName: string | null = null;
        let destName: string | null = null;
        if (tx.category_id) {
          const { data: cat } = await supabase.from('categories').select('name').eq('id', tx.category_id).single();
          categoryName = cat?.name || null;
        }
        if (tx.source_account_id) {
          const { data: acc } = await supabase.from('accounts').select('name').eq('id', tx.source_account_id).single();
          sourceName = acc?.name || null;
        }
        if (tx.destination_account_id) {
          const { data: acc } = await supabase.from('accounts').select('name').eq('id', tx.destination_account_id).single();
          destName = acc?.name || null;
        }
        return { ...tx, category_name: categoryName, source_name: sourceName, destination_name: destName };
      }));
      return enriched;
    },
    get: async (id: string): Promise<Transaction | null> => {
      const { data, error } = await supabase.from('transactions').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    create: async (tx: Partial<Transaction>): Promise<Transaction> => {
      const user = await getUser();
      const { data, error } = await supabase.from('transactions').insert({ ...tx, user_id: user?.id }).select().single();
      if (error) throw error;
      // Update account balance
      if (tx.source_account_id && (tx.type === 'withdrawal' || tx.type === 'transfer')) {
        await supabase.rpc('decrement_balance', { acc_id: tx.source_account_id, amount: Math.abs(tx.amount || 0) });
      }
      if (tx.destination_account_id && (tx.type === 'deposit' || tx.type === 'transfer')) {
        await supabase.rpc('increment_balance', { acc_id: tx.destination_account_id, amount: Math.abs(tx.amount || 0) });
      }
      return data;
    },
    update: async (id: string, updates: Partial<Transaction>): Promise<Transaction> => {
      const { data, error } = await supabase.from('transactions').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
    },
  },

  // ─── CATEGORIES ────────────────────────────────────────────
  categories: {
    list: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from('categories').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
    get: async (id: string): Promise<Category | null> => {
      const { data, error } = await supabase.from('categories').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    create: async (name: string): Promise<Category> => {
      const user = await getUser();
      const { data, error } = await supabase.from('categories').insert({ name, user_id: user?.id }).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
  },

  // ─── BUDGETS ───────────────────────────────────────────────
  budgets: {
    list: async (): Promise<Budget[]> => {
      const { data, error } = await supabase.from('budgets').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
    get: async (id: string): Promise<Budget | null> => {
      const { data, error } = await supabase.from('budgets').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    create: async (budget: Partial<Budget>): Promise<Budget> => {
      const user = await getUser();
      const { data, error } = await supabase.from('budgets').insert({ ...budget, user_id: user?.id }).select().single();
      if (error) throw error;
      return data;
    },
  },

  // ─── PIGGY BANKS ──────────────────────────────────────────
  piggyBanks: {
    list: async (): Promise<PiggyBank[]> => {
      const { data, error } = await supabase.from('piggy_banks').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
    get: async (id: string): Promise<PiggyBank | null> => {
      const { data, error } = await supabase.from('piggy_banks').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    create: async (jar: Partial<PiggyBank>): Promise<PiggyBank> => {
      const user = await getUser();
      const { data, error } = await supabase.from('piggy_banks').insert({ ...jar, user_id: user?.id }).select().single();
      if (error) throw error;
      return data;
    },
    update: async (id: string, updates: Partial<PiggyBank>): Promise<PiggyBank> => {
      const { data, error } = await supabase.from('piggy_banks').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
  },

  // ─── LIABILITIES ───────────────────────────────────────────
  liabilities: {
    list: async (): Promise<Liability[]> => {
      const { data, error } = await supabase.from('liabilities').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
    get: async (id: string): Promise<Liability | null> => {
      const { data, error } = await supabase.from('liabilities').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    create: async (liability: Partial<Liability>): Promise<Liability> => {
      const user = await getUser();
      const { data, error } = await supabase.from('liabilities').insert({ ...liability, user_id: user?.id }).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('liabilities').delete().eq('id', id);
      if (error) throw error;
    },
  },

  // ─── EXCHANGE RATES ───────────────────────────────────────
  exchangeRates: {
    getAll: async (): Promise<ExchangeRate[]> => {
      const { data, error } = await supabase.from('exchange_rates').select('*').order('date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    getByDate: async (date: string): Promise<ExchangeRate[]> => {
      const { data, error } = await supabase.from('exchange_rates').select('*').eq('date', date);
      if (error) throw error;
      return data || [];
    },
    set: async (rate: Omit<ExchangeRate, 'id' | 'user_id' | 'created_at'>): Promise<ExchangeRate> => {
      const user = await getUser();
      const { data, error } = await supabase
        .from('exchange_rates')
        .upsert({ ...rate, user_id: user?.id }, { onConflict: 'user_id,date,from_currency,to_currency' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
  },

  // ─── ACCOUNT ACQUISITION ──────────────────────────────────
  accountAcquisition: {
    getAll: async (): Promise<AccountAcquisition[]> => {
      const { data, error } = await supabase.from('account_acquisition').select('*');
      if (error) throw error;
      return data || [];
    },
    get: async (accountId: string): Promise<AccountAcquisition | null> => {
      const { data, error } = await supabase.from('account_acquisition').select('*').eq('account_id', accountId).single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    set: async (acq: { account_id: string; average_rate: number; notes: string }): Promise<AccountAcquisition> => {
      const user = await getUser();
      const { data, error } = await supabase
        .from('account_acquisition')
        .upsert({ ...acq, user_id: user?.id, updated_at: new Date().toISOString() }, { onConflict: 'user_id,account_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
  },

  // ─── HOUSEHOLD TASKS ──────────────────────────────────────
  householdTasks: {
    getAll: async (): Promise<HouseholdTask[]> => {
      const { data, error } = await supabase.from('household_tasks').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    set: async (task: Partial<HouseholdTask>): Promise<HouseholdTask> => {
      const user = await getUser();
      if (task.id) {
        const { data, error } = await supabase.from('household_tasks').update(task).eq('id', task.id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from('household_tasks').insert({ ...task, user_id: user?.id }).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('household_tasks').delete().eq('id', id);
      if (error) throw error;
    },
  },

  // ─── MAINTENANCE LOGS ─────────────────────────────────────
  maintenanceLogs: {
    getAll: async (): Promise<MaintenanceLog[]> => {
      const { data, error } = await supabase.from('maintenance_logs').select('*').order('date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    set: async (log: Partial<MaintenanceLog>): Promise<MaintenanceLog> => {
      const user = await getUser();
      if (log.id) {
        const { data, error } = await supabase.from('maintenance_logs').update(log).eq('id', log.id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from('maintenance_logs').insert({ ...log, user_id: user?.id }).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('maintenance_logs').delete().eq('id', id);
      if (error) throw error;
    },
  },

  // ─── VEHICLE RECORDS ──────────────────────────────────────
  vehicleRecords: {
    getAll: async (): Promise<VehicleRecord[]> => {
      const { data, error } = await supabase.from('vehicle_records').select('*').order('date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    set: async (record: Partial<VehicleRecord>): Promise<VehicleRecord> => {
      const user = await getUser();
      if (record.id) {
        const { data, error } = await supabase.from('vehicle_records').update(record).eq('id', record.id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from('vehicle_records').insert({ ...record, user_id: user?.id }).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('vehicle_records').delete().eq('id', id);
      if (error) throw error;
    },
  },

  // ─── BABY RECORDS ─────────────────────────────────────────
  babyRecords: {
    getAll: async (): Promise<BabyRecord[]> => {
      const { data, error } = await supabase.from('baby_records').select('*').order('date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    set: async (record: Partial<BabyRecord>): Promise<BabyRecord> => {
      const user = await getUser();
      if (record.id) {
        const { data, error } = await supabase.from('baby_records').update(record).eq('id', record.id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from('baby_records').insert({ ...record, user_id: user?.id }).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('baby_records').delete().eq('id', id);
      if (error) throw error;
    },
  },

  // ─── PENDING TRANSACTIONS (kept in Supabase) ──────────────
  pendingTransactions: {
    getAll: async (): Promise<PendingTransaction[]> => {
      // Pending transactions are stored in localStorage (simple, no auth needed)
      try {
        const raw = localStorage.getItem('lifeos_pending_txs');
        return raw ? JSON.parse(raw) : [];
      } catch { return []; }
    },
    set: async (tx: PendingTransaction): Promise<void> => {
      const all = await db.pendingTransactions.getAll();
      const idx = all.findIndex(t => t.id === tx.id);
      if (idx >= 0) all[idx] = tx;
      else all.unshift(tx);
      localStorage.setItem('lifeos_pending_txs', JSON.stringify(all));
    },
    delete: async (id: string): Promise<void> => {
      const all = await db.pendingTransactions.getAll();
      localStorage.setItem('lifeos_pending_txs', JSON.stringify(all.filter(t => t.id !== id)));
    },
  },

  // ─── SUMMARY ──────────────────────────────────────────────
  summary: {
    netWorth: async (): Promise<number> => {
      const { data, error } = await supabase.from('accounts').select('current_balance, currency').eq('active', true).eq('include_in_net_worth', true);
      if (error) throw error;
      return (data || []).reduce((sum: number, a: any) => sum + parseFloat(a.current_balance || '0'), 0);
    },
  },
};
