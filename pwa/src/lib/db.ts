import { supabase } from '@/lib/supabase';
import type {
  Account, Transaction, Category, Budget, PiggyBank, Liability,
  ExchangeRate, AccountAcquisition, HouseholdTask, MaintenanceLog,
  VehicleRecord, BabyRecord, PendingTransaction, LiabilityMovement,
  ReconciliationGroup,
} from '@/types';

async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Convierte un monto de cualquier moneda a USD
async function toUSD(amount: number, currency: string, date?: string): Promise<number> {
  if (currency === 'USD' || currency === 'USDT') return amount;
  const txDate = date || new Date().toISOString().split('T')[0];
  const { data: rates } = await supabase.from('exchange_rates').select('*').eq('date', txDate);
  let rate = rates?.find(r => r.to_currency === currency)?.rate;
  if (!rate) {
    const { data: allRates } = await supabase.from('exchange_rates').select('*').order('date', { ascending: false });
    rate = allRates?.find(r => r.to_currency === currency)?.rate;
  }
  if (!rate) return amount;
  return amount / rate;
}

// Convierte entre dos monedas (para jarras)
async function convertCurrency(amount: number, from: string, to: string, date?: string): Promise<number> {
  if (from === to) return amount;
  const usdAmount = await toUSD(amount, from, date);
  if (to === 'USD' || to === 'USDT') return usdAmount;
  const txDate = date || new Date().toISOString().split('T')[0];
  const { data: rates } = await supabase.from('exchange_rates').select('*').eq('date', txDate);
  let rate = rates?.find(r => r.to_currency === to)?.rate;
  if (!rate) {
    const { data: allRates } = await supabase.from('exchange_rates').select('*').order('date', { ascending: false });
    rate = allRates?.find(r => r.to_currency === to)?.rate;
  }
  if (!rate) return amount;
  return usdAmount * rate;
}

// Recalcula la tasa P2P promedio del día para un par de monedas, a partir de
// todas las transferencias reales registradas ese día (suma destino / suma origen).
// No sobreescribe una tasa cargada manualmente como 'official'.
async function recalcP2PRate(
  date: string | null | undefined,
  fromCurrency: string | null | undefined,
  toCurrency: string | null | undefined,
): Promise<void> {
  if (!date || !fromCurrency || !toCurrency || fromCurrency === toCurrency) return;
  const user = await getUser();

  const { data: txs } = await supabase
    .from('transactions')
    .select('amount, foreign_amount')
    .eq('type', 'transfer')
    .eq('date', date)
    .eq('currency', fromCurrency)
    .eq('foreign_currency', toCurrency)
    .not('foreign_amount', 'is', null);

  if (!txs || txs.length === 0) {
    await supabase.from('exchange_rates').delete()
      .eq('user_id', user?.id).eq('date', date)
      .eq('from_currency', fromCurrency).eq('to_currency', toCurrency)
      .eq('source', 'p2p_average');
    return;
  }

  const { data: existing } = await supabase
    .from('exchange_rates').select('source')
    .eq('user_id', user?.id).eq('date', date)
    .eq('from_currency', fromCurrency).eq('to_currency', toCurrency)
    .maybeSingle();
  if (existing?.source === 'official') return;

  const sumFrom = txs.reduce((s, t) => s + parseFloat(String(t.amount || 0)), 0);
  const sumTo = txs.reduce((s, t) => s + parseFloat(String(t.foreign_amount || 0)), 0);
  if (sumFrom <= 0) return;

  await supabase.from('exchange_rates').upsert({
    user_id: user?.id, date, from_currency: fromCurrency, to_currency: toCurrency,
    rate: sumTo / sumFrom, source: 'p2p_average', transactions_used: txs.length,
  }, { onConflict: 'user_id,date,from_currency,to_currency' });
}

// Batch enrichment — O(3 queries) regardless of list size, replaces the old O(n*5) approach
async function enrichTransactions(txs: any[]): Promise<any[]> {
  if (txs.length === 0) return txs;

  const accountIds = [...new Set(
    txs.flatMap(t => [t.source_account_id, t.destination_account_id]).filter(Boolean)
  )];
  const categoryIds = [...new Set(txs.map(t => t.category_id).filter(Boolean))];
  const jarIds = [...new Set(
    txs.flatMap(t => [t.piggy_bank_id, t.destination_piggy_bank_id]).filter(Boolean)
  )];

  const [accRes, catRes, jarRes] = await Promise.all([
    accountIds.length
      ? supabase.from('accounts').select('id,name').in('id', accountIds)
      : Promise.resolve({ data: [] }),
    categoryIds.length
      ? supabase.from('categories').select('id,name').in('id', categoryIds)
      : Promise.resolve({ data: [] }),
    jarIds.length
      ? supabase.from('piggy_banks').select('id,name').in('id', jarIds)
      : Promise.resolve({ data: [] }),
  ]);

  const accMap = new Map((accRes.data || []).map((a: any) => [a.id, a.name]));
  const catMap = new Map((catRes.data || []).map((c: any) => [c.id, c.name]));
  const jarMap = new Map((jarRes.data || []).map((j: any) => [j.id, j.name]));

  return txs.map(tx => ({
    ...tx,
    category_name: tx.category_id ? catMap.get(tx.category_id) ?? null : null,
    source_name: tx.source_account_id ? accMap.get(tx.source_account_id) ?? null : null,
    destination_name: tx.destination_account_id ? accMap.get(tx.destination_account_id) ?? null : null,
    piggy_bank_name: tx.piggy_bank_id ? jarMap.get(tx.piggy_bank_id) ?? null : null,
    destination_piggy_bank_name: tx.destination_piggy_bank_id ? jarMap.get(tx.destination_piggy_bank_id) ?? null : null,
  }));
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
        .order('date', { ascending: true });
      if (params?.limit) q = q.limit(params.limit);
      if (params?.start) q = q.gte('date', params.start);
      if (params?.end) q = q.lte('date', params.end);
      const { data, error } = await q;
      if (error) throw error;
      return await enrichTransactions(data || []);
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
      return await enrichTransactions(data || []);
    },
    get: async (id: string): Promise<Transaction | null> => {
      const { data, error } = await supabase.from('transactions').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    create: async (tx: Partial<Transaction>): Promise<Transaction> => {
      const user = await getUser();
      const amount = parseFloat(String(tx.amount || 0));
      const type = tx.type;
      const txCurrency = tx.currency || 'USD';
      const txDate = tx.date || new Date().toISOString().split('T')[0];

      const amountUsd = await toUSD(amount, txCurrency, txDate);

      const { data, error } = await supabase.from('transactions').insert({
        ...tx, user_id: user?.id, amount_usd: amountUsd,
      }).select().single();
      if (error) throw error;

      const sourceId = tx.source_account_id || null;
      const destId = tx.destination_account_id || null;
      const piggyId = tx.piggy_bank_id || null;
      const destPiggyId = tx.destination_piggy_bank_id || null;

      // Update account balances
      if (type === 'withdrawal' && sourceId) {
        await supabase.rpc('decrement_balance', { acc_id: sourceId, amt: amount });
      } else if (type === 'deposit' && destId) {
        await supabase.rpc('increment_balance', { acc_id: destId, amt: amount });
      } else if (type === 'transfer') {
        if (sourceId) await supabase.rpc('decrement_balance', { acc_id: sourceId, amt: amount });
        if (destId && tx.foreign_amount) {
          await supabase.rpc('increment_balance', { acc_id: destId, amt: parseFloat(String(tx.foreign_amount)) });
        } else if (destId) {
          await supabase.rpc('increment_balance', { acc_id: destId, amt: amount });
        }
      }

      // Update jar amounts
      // deposit → piggyId: income goes TO the jar (increment)
      if (piggyId && type === 'deposit') {
        const { data: jar } = await supabase.from('piggy_banks').select('currency').eq('id', piggyId).single();
        const jarAmt = await convertCurrency(amount, txCurrency, jar?.currency || 'USD', txDate);
        await supabase.rpc('increment_jar', { jar_id: piggyId, amt: jarAmt });
      }
      // withdrawal → piggyId: expense comes FROM the jar (decrement)
      if (piggyId && (type === 'withdrawal' || type === 'transfer')) {
        const { data: jar } = await supabase.from('piggy_banks').select('currency').eq('id', piggyId).single();
        const jarAmt = await convertCurrency(amount, txCurrency, jar?.currency || 'USD', txDate);
        await supabase.rpc('decrement_jar', { jar_id: piggyId, amt: jarAmt });
      }
      if (destPiggyId && type === 'transfer') {
        const { data: jar } = await supabase.from('piggy_banks').select('currency').eq('id', destPiggyId).single();
        const destCurrency = jar?.currency || 'USD';
        if (tx.foreign_amount) {
          const { data: destAcc } = await supabase.from('accounts').select('currency').eq('id', destId).single();
          const jarAmt = await convertCurrency(parseFloat(String(tx.foreign_amount)), destAcc?.currency || 'USD', destCurrency, txDate);
          await supabase.rpc('increment_jar', { jar_id: destPiggyId, amt: jarAmt });
        } else {
          const jarAmt = await convertCurrency(amount, txCurrency, destCurrency, txDate);
          await supabase.rpc('increment_jar', { jar_id: destPiggyId, amt: jarAmt });
        }
      }

      if (type === 'transfer' && tx.foreign_amount && tx.foreign_currency && tx.foreign_currency !== txCurrency) {
        await recalcP2PRate(txDate, txCurrency, tx.foreign_currency);
      }

      return data;
    },
    update: async (id: string, updates: Partial<Transaction>): Promise<Transaction> => {
      const { data: orig } = await supabase.from('transactions').select('*').eq('id', id).single();
      if (orig) {
        const origAmt = parseFloat(String(orig.amount || 0));
        const origCurrency = orig.currency || 'USD';
        // Reverse original account changes
        if (orig.type === 'withdrawal' && orig.source_account_id) {
          await supabase.rpc('increment_balance', { acc_id: orig.source_account_id, amt: origAmt });
        } else if (orig.type === 'deposit' && orig.destination_account_id) {
          await supabase.rpc('decrement_balance', { acc_id: orig.destination_account_id, amt: origAmt });
        } else if (orig.type === 'transfer') {
          if (orig.source_account_id) await supabase.rpc('increment_balance', { acc_id: orig.source_account_id, amt: origAmt });
          if (orig.destination_account_id) {
            const origForeign = orig.foreign_amount ? parseFloat(String(orig.foreign_amount)) : origAmt;
            await supabase.rpc('decrement_balance', { acc_id: orig.destination_account_id, amt: origForeign });
          }
        }
        // Reverse original jar changes
        if (orig.piggy_bank_id && orig.type === 'deposit') {
          // Reverse: deposit had incremented the jar, so decrement to undo
          const { data: jar } = await supabase.from('piggy_banks').select('currency').eq('id', orig.piggy_bank_id).single();
          const jarAmt = await convertCurrency(origAmt, origCurrency, jar?.currency || 'USD', orig.date);
          await supabase.rpc('decrement_jar', { jar_id: orig.piggy_bank_id, amt: jarAmt });
        }
        if (orig.piggy_bank_id && (orig.type === 'withdrawal' || orig.type === 'transfer')) {
          const { data: jar } = await supabase.from('piggy_banks').select('currency').eq('id', orig.piggy_bank_id).single();
          const jarAmt = await convertCurrency(origAmt, origCurrency, jar?.currency || 'USD', orig.date);
          await supabase.rpc('increment_jar', { jar_id: orig.piggy_bank_id, amt: jarAmt });
        }
        if (orig.destination_piggy_bank_id && orig.type === 'transfer') {
          const { data: jar } = await supabase.from('piggy_banks').select('currency').eq('id', orig.destination_piggy_bank_id).single();
          const origForeign = orig.foreign_amount ? parseFloat(String(orig.foreign_amount)) : origAmt;
          const origDestAccCurrency = orig.destination_account_id
            ? (await supabase.from('accounts').select('currency').eq('id', orig.destination_account_id).single()).data?.currency || 'USD'
            : origCurrency;
          const jarAmt = await convertCurrency(origForeign, origDestAccCurrency, jar?.currency || 'USD', orig.date);
          await supabase.rpc('decrement_jar', { jar_id: orig.destination_piggy_bank_id, amt: jarAmt });
        }
      }

      const newAmount = parseFloat(String(updates.amount ?? orig?.amount ?? 0));
      const newCurrency = updates.currency ?? orig?.currency ?? 'USD';
      const newDate = updates.date ?? orig?.date ?? new Date().toISOString().split('T')[0];
      const newAmountUsd = await toUSD(newAmount, newCurrency, newDate);

      const { data, error } = await supabase.from('transactions').update({
        ...updates, amount_usd: newAmountUsd,
      }).eq('id', id).select().single();
      if (error) throw error;

      const amount = newAmount;
      const type = updates.type ?? orig?.type;
      const txCurrency = newCurrency;
      const txDate = newDate;
      const sourceId = updates.source_account_id ?? orig?.source_account_id;
      const destId = updates.destination_account_id ?? orig?.destination_account_id;
      const piggyId = updates.piggy_bank_id ?? orig?.piggy_bank_id;
      const destPiggyId = updates.destination_piggy_bank_id ?? orig?.destination_piggy_bank_id;
      const foreignAmount = updates.foreign_amount ?? orig?.foreign_amount;

      if (type === 'withdrawal' && sourceId) {
        await supabase.rpc('decrement_balance', { acc_id: sourceId, amt: amount });
      } else if (type === 'deposit' && destId) {
        await supabase.rpc('increment_balance', { acc_id: destId, amt: amount });
      } else if (type === 'transfer') {
        if (sourceId) await supabase.rpc('decrement_balance', { acc_id: sourceId, amt: amount });
        if (destId && foreignAmount) {
          await supabase.rpc('increment_balance', { acc_id: destId, amt: parseFloat(String(foreignAmount)) });
        } else if (destId) {
          await supabase.rpc('increment_balance', { acc_id: destId, amt: amount });
        }
      }

      if (piggyId && type === 'deposit') {
        const { data: jar } = await supabase.from('piggy_banks').select('currency').eq('id', piggyId).single();
        const jarAmt = await convertCurrency(amount, txCurrency, jar?.currency || 'USD', txDate);
        await supabase.rpc('increment_jar', { jar_id: piggyId, amt: jarAmt });
      }
      if (piggyId && (type === 'withdrawal' || type === 'transfer')) {
        const { data: jar } = await supabase.from('piggy_banks').select('currency').eq('id', piggyId).single();
        const jarAmt = await convertCurrency(amount, txCurrency, jar?.currency || 'USD', txDate);
        await supabase.rpc('decrement_jar', { jar_id: piggyId, amt: jarAmt });
      }
      if (destPiggyId && type === 'transfer') {
        const { data: jar } = await supabase.from('piggy_banks').select('currency').eq('id', destPiggyId).single();
        const destCurrency = jar?.currency || 'USD';
        if (foreignAmount) {
          const { data: destAcc } = await supabase.from('accounts').select('currency').eq('id', destId).single();
          const jarAmt = await convertCurrency(parseFloat(String(foreignAmount)), destAcc?.currency || 'USD', destCurrency, txDate);
          await supabase.rpc('increment_jar', { jar_id: destPiggyId, amt: jarAmt });
        } else {
          const jarAmt = await convertCurrency(amount, txCurrency, destCurrency, txDate);
          await supabase.rpc('increment_jar', { jar_id: destPiggyId, amt: jarAmt });
        }
      }

      const foreignCurrency = updates.foreign_currency ?? orig?.foreign_currency;
      if (orig?.type === 'transfer' && orig.foreign_amount && orig.foreign_currency && orig.foreign_currency !== orig.currency) {
        await recalcP2PRate(orig.date, orig.currency, orig.foreign_currency);
      }
      if (type === 'transfer' && foreignAmount && foreignCurrency && foreignCurrency !== txCurrency) {
        await recalcP2PRate(txDate, txCurrency, foreignCurrency);
      }

      return data;
    },
    delete: async (id: string): Promise<void> => {
      const { data: orig } = await supabase.from('transactions').select('*').eq('id', id).single();
      if (orig) {
        const origAmt = parseFloat(String(orig.amount || 0));
        const origCurrency = orig.currency || 'USD';
        if (orig.type === 'withdrawal' && orig.source_account_id) {
          await supabase.rpc('increment_balance', { acc_id: orig.source_account_id, amt: origAmt });
        } else if (orig.type === 'deposit' && orig.destination_account_id) {
          await supabase.rpc('decrement_balance', { acc_id: orig.destination_account_id, amt: origAmt });
        } else if (orig.type === 'transfer') {
          if (orig.source_account_id) await supabase.rpc('increment_balance', { acc_id: orig.source_account_id, amt: origAmt });
          if (orig.destination_account_id) {
            const origForeign = orig.foreign_amount ? parseFloat(String(orig.foreign_amount)) : origAmt;
            await supabase.rpc('decrement_balance', { acc_id: orig.destination_account_id, amt: origForeign });
          }
        }
        // Reverse jar changes
        if (orig.piggy_bank_id && orig.type === 'deposit') {
          const { data: jar } = await supabase.from('piggy_banks').select('currency').eq('id', orig.piggy_bank_id).single();
          const jarAmt = await convertCurrency(origAmt, origCurrency, jar?.currency || 'USD', orig.date);
          await supabase.rpc('decrement_jar', { jar_id: orig.piggy_bank_id, amt: jarAmt });
        }
        if (orig.piggy_bank_id && (orig.type === 'withdrawal' || orig.type === 'transfer')) {
          const { data: jar } = await supabase.from('piggy_banks').select('currency').eq('id', orig.piggy_bank_id).single();
          const jarAmt = await convertCurrency(origAmt, origCurrency, jar?.currency || 'USD', orig.date);
          await supabase.rpc('increment_jar', { jar_id: orig.piggy_bank_id, amt: jarAmt });
        }
        if (orig.destination_piggy_bank_id && orig.type === 'transfer') {
          const { data: jar } = await supabase.from('piggy_banks').select('currency').eq('id', orig.destination_piggy_bank_id).single();
          const origForeign = orig.foreign_amount ? parseFloat(String(orig.foreign_amount)) : origAmt;
          const origDestAccCurrency = orig.destination_account_id
            ? (await supabase.from('accounts').select('currency').eq('id', orig.destination_account_id).single()).data?.currency || 'USD'
            : origCurrency;
          const jarAmt = await convertCurrency(origForeign, origDestAccCurrency, jar?.currency || 'USD', orig.date);
          await supabase.rpc('decrement_jar', { jar_id: orig.destination_piggy_bank_id, amt: jarAmt });
        }
      }
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;

      if (orig?.type === 'transfer' && orig.foreign_amount && orig.foreign_currency && orig.foreign_currency !== orig.currency) {
        await recalcP2PRate(orig.date, orig.currency, orig.foreign_currency);
      }
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
    update: async (id: string, name: string): Promise<Category> => {
      const { data, error } = await supabase.from('categories').update({ name }).eq('id', id).select().single();
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
      const budgets = data || [];
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      for (const bud of budgets) {
        try {
          const { data: txData } = await supabase.from('transactions')
            .select('amount, currency')
            .eq('type', 'withdrawal')
            .eq('currency', bud.currency)
            .gte('date', start)
            .lte('date', end);
          let spent = 0;
          for (const tx of txData || []) {
            spent += parseFloat(tx.amount || '0');
          }
          (bud as any).spent = spent;
        } catch {
          (bud as any).spent = 0;
        }
      }
      return budgets;
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
    update: async (id: string, updates: Partial<Budget>): Promise<Budget> => {
      const { data, error } = await supabase.from('budgets').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('budgets').delete().eq('id', id);
      if (error) throw error;
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
    transactions: async (jarId: string, params?: { start?: string; end?: string }): Promise<Transaction[]> => {
      let q = supabase
        .from('transactions')
        .select('*')
        .or(`piggy_bank_id.eq.${jarId},destination_piggy_bank_id.eq.${jarId}`)
        .order('date', { ascending: true });
      if (params?.start) q = q.gte('date', params.start);
      if (params?.end) q = q.lte('date', params.end);
      const { data, error } = await q;
      if (error) throw error;
      return await enrichTransactions(data || []);
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
    list: async (includeArchived = false): Promise<Liability[]> => {
      let q = supabase.from('liabilities').select('*').order('name');
      if (!includeArchived) q = q.eq('archived', false);
      const { data, error } = await q;
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
    update: async (id: string, updates: Partial<Liability>): Promise<Liability> => {
      const { data, error } = await supabase.from('liabilities').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('liabilities').delete().eq('id', id);
      if (error) throw error;
    },
    archive: async (id: string): Promise<void> => {
      const { error } = await supabase.from('liabilities').update({
        archived: true,
        paid_date: new Date().toISOString().split('T')[0],
        current_balance: 0,
      }).eq('id', id);
      if (error) throw error;
    },
    movements: async (liabilityId: string): Promise<LiabilityMovement[]> => {
      const { data, error } = await supabase
        .from('liability_movements')
        .select('*')
        .eq('liability_id', liabilityId)
        .order('date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    addMovement: async (movement: Omit<LiabilityMovement, 'id' | 'user_id' | 'created_at'>): Promise<LiabilityMovement> => {
      const user = await getUser();
      const { data, error } = await supabase
        .from('liability_movements')
        .insert({ ...movement, user_id: user?.id })
        .select()
        .single();
      if (error) throw error;

      // Update the liability balance
      const { data: liab } = await supabase
        .from('liabilities')
        .select('current_balance')
        .eq('id', movement.liability_id)
        .single();

      const currentBalance = parseFloat(liab?.current_balance || '0');
      const newBalance = movement.type === 'payment'
        ? Math.max(0, currentBalance - movement.amount)
        : currentBalance + movement.amount;

      await supabase.from('liabilities').update({ current_balance: newBalance }).eq('id', movement.liability_id);

      return data;
    },
    deleteMovement: async (movementId: string, liabilityId: string, amount: number, type: string): Promise<void> => {
      // Reverse the balance effect before deleting
      const { data: liab } = await supabase
        .from('liabilities')
        .select('current_balance')
        .eq('id', liabilityId)
        .single();

      const currentBalance = parseFloat(liab?.current_balance || '0');
      const newBalance = type === 'payment'
        ? currentBalance + amount  // restore what was paid
        : Math.max(0, currentBalance - amount);  // remove what was added

      await supabase.from('liabilities').update({ current_balance: newBalance }).eq('id', liabilityId);
      const { error } = await supabase.from('liability_movements').delete().eq('id', movementId);
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

  // ─── RECONCILIATION GROUPS ─────────────────────────────────
  reconciliationGroups: {
    list: async (): Promise<ReconciliationGroup[]> => {
      const { data, error } = await supabase.from('reconciliation_groups').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
    create: async (group: { name: string; account_ids: string[]; jar_ids: string[] }): Promise<ReconciliationGroup> => {
      const user = await getUser();
      const { data, error } = await supabase.from('reconciliation_groups').insert({ ...group, user_id: user?.id }).select().single();
      if (error) throw error;
      return data;
    },
    update: async (id: string, updates: { name: string; account_ids: string[]; jar_ids: string[] }): Promise<ReconciliationGroup> => {
      const { data, error } = await supabase.from('reconciliation_groups').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('reconciliation_groups').delete().eq('id', id);
      if (error) throw error;
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

  // ─── PENDING TRANSACTIONS ──────────────────────────────────
  pendingTransactions: {
    getAll: async (): Promise<PendingTransaction[]> => {
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
