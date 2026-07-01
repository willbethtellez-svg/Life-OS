import type { Account, PiggyBank, Transaction, ExchangeRate } from '@/types';

// ─── Conversión de moneda en el cliente ──────────────────────────────
// Espeja la lógica de toUSD/convertCurrency en db.ts pero de forma síncrona
// sobre las tasas ya cargadas en el store, para no disparar una consulta a
// Supabase por cada celda que se renderiza.

export function toUSDClient(amount: number, currency: string, rates: ExchangeRate[], date?: string | null): number {
  if (currency === 'USD' || currency === 'USDT') return amount;
  let rate = date ? rates.find(r => r.date === date && r.to_currency === currency)?.rate : undefined;
  if (!rate) {
    rate = [...rates].filter(r => r.to_currency === currency).sort((a, b) => b.date.localeCompare(a.date))[0]?.rate;
  }
  if (!rate) return amount;
  return amount / rate;
}

export function usdToCurrencyClient(amountUsd: number, currency: string, rates: ExchangeRate[], date?: string | null): number {
  if (currency === 'USD' || currency === 'USDT') return amountUsd;
  let rate = date ? rates.find(r => r.date === date && r.to_currency === currency)?.rate : undefined;
  if (!rate) {
    rate = [...rates].filter(r => r.to_currency === currency).sort((a, b) => b.date.localeCompare(a.date))[0]?.rate;
  }
  if (!rate) return amountUsd;
  return amountUsd * rate;
}

const typeLabelEs: Record<string, string> = { withdrawal: 'gasto', deposit: 'ingreso', transfer: 'transferencia' };

// ─── Cuentas ──────────────────────────────────────────────────────────
// Una sola fuente de verdad para el saldo: arranca en initial_balance y
// recorre los movimientos reales. La comisión de cada transacción se modela
// como un renglón aparte ("Comisión de ...") que sale de la cuenta que
// originó el movimiento, en vez de mezclarse silenciosamente en el monto.
// amountUsd viaja en cada entrada porque además de alimentar el libro
// contable en moneda nativa, es la base para el cálculo de conciliación por
// tasa histórica (ver computeAccountHistoricalUsdBasis).
export interface AccountLedgerEntry {
  key: string;
  date: string;
  description: string;
  amount: number;
  amountUsd: number;
  isDebit: boolean;
  isFee: boolean;
}

export function buildAccountEntries(accountId: string, txs: Transaction[]): AccountLedgerEntry[] {
  const entries: AccountLedgerEntry[] = [];
  for (const tx of txs) {
    const isSource = tx.source_account_id === accountId;
    const isDest = tx.destination_account_id === accountId;
    const amountUsd = parseFloat(String(tx.amount_usd ?? 0));
    const nativeAmount = parseFloat(String(tx.amount));
    if (isSource) {
      entries.push({ key: tx.id, date: tx.date, description: tx.description, amount: nativeAmount, amountUsd, isDebit: true, isFee: false });
    } else if (isDest) {
      const amt = parseFloat(String(tx.foreign_amount ?? tx.amount));
      // La transferencia se asume de valor equivalente en ambos lados (misma
      // suposición que ya usábamos para las jarras): el USD del lado destino
      // es el mismo amount_usd calculado para el lado origen.
      entries.push({ key: tx.id, date: tx.date, description: tx.description, amount: amt, amountUsd, isDebit: false, isFee: false });
    }
    const fee = parseFloat(String(tx.fee || 0));
    if (fee > 0) {
      const feeAccountId = tx.source_account_id || tx.destination_account_id;
      if (feeAccountId === accountId) {
        const unitUsdRate = nativeAmount > 0 ? amountUsd / nativeAmount : 0;
        entries.push({
          key: `${tx.id}-fee`,
          date: tx.date,
          description: `Comisión de "${tx.description || typeLabelEs[tx.type] || tx.type}"`,
          amount: fee,
          amountUsd: fee * unitUsdRate,
          isDebit: true,
          isFee: true,
        });
      }
    }
  }
  return entries;
}

export function computeAccountFinalBalance(account: Account, txs: Transaction[]): number {
  const entries = buildAccountEntries(account.id, txs);
  let bal = parseFloat(String(account.initial_balance));
  for (const e of entries) bal += e.isDebit ? -e.amount : e.amount;
  return bal;
}

// Saldo de la cuenta expresado en USD "a tasa histórica": el saldo inicial se
// convierte con la tasa vigente en la fecha de creación de la cuenta, y cada
// movimiento aporta el amount_usd que ya quedó grabado con la tasa del día en
// que ocurrió. Sirve para aislar cuánto de una brecha de conciliación es solo
// por el movimiento del tipo de cambio desde entonces hasta hoy.
export function computeAccountHistoricalUsdBasis(account: Account, txs: Transaction[], rates: ExchangeRate[]): number {
  const initialDate = account.created_at?.split('T')[0] || null;
  let bal = toUSDClient(parseFloat(String(account.initial_balance)), account.currency, rates, initialDate);
  for (const e of buildAccountEntries(account.id, txs)) {
    bal += e.isDebit ? -e.amountUsd : e.amountUsd;
  }
  return bal;
}

// ─── Jarras ───────────────────────────────────────────────────────────

export interface JarLedgerEntry {
  key: string;
  date: string;
  description: string;
  amountUsd: number;
  nativeAmount: number;
  nativeCurrency: string;
  isIn: boolean;
  isFee: boolean;
}

// Genera todas las entradas de una transacción para una jarra dada. Una
// transferencia cuya jarra de origen y destino son la MISMA jarra (uso común:
// "mover" dinero entre cuentas dejando constancia solo de la comisión) debe
// producir DOS entradas — la salida y la vuelta a entrar — no solo una; antes
// se usaba un if/return secuencial que devolvía la primera rama que aplicara,
// por lo que la entrada nunca se veía en ese caso. El monto USD de cada
// movimiento viene directo de tx.amount_usd (ya calculado y persistido
// server-side con la tasa del día); el monto nativo se muestra solo como
// referencia pequeña en el libro contable.
export function buildJarEntries(jarId: string, txs: Transaction[]): JarLedgerEntry[] {
  const entries: JarLedgerEntry[] = [];
  for (const tx of txs) {
    const isSrcJar = tx.piggy_bank_id === jarId;
    const isDestJar = tx.destination_piggy_bank_id === jarId;
    const amountUsd = parseFloat(String(tx.amount_usd ?? 0));
    const nativeAmount = parseFloat(String(tx.amount));
    const nativeCurrency = tx.currency;

    if (tx.type === 'deposit' && isSrcJar) {
      entries.push({ key: tx.id, date: tx.date, description: tx.description, amountUsd, nativeAmount, nativeCurrency, isIn: true, isFee: false });
    }
    if (tx.type === 'withdrawal' && isSrcJar) {
      entries.push({ key: tx.id, date: tx.date, description: tx.description, amountUsd, nativeAmount, nativeCurrency, isIn: false, isFee: false });
    }
    if (tx.type === 'transfer') {
      if (isSrcJar) {
        entries.push({ key: `${tx.id}-out`, date: tx.date, description: tx.description, amountUsd, nativeAmount, nativeCurrency, isIn: false, isFee: false });
      }
      if (isDestJar) {
        const destNativeAmount = tx.foreign_amount != null ? parseFloat(String(tx.foreign_amount)) : nativeAmount;
        const destNativeCurrency = tx.foreign_currency || tx.currency;
        entries.push({ key: `${tx.id}-in`, date: tx.date, description: tx.description, amountUsd, nativeAmount: destNativeAmount, nativeCurrency: destNativeCurrency, isIn: true, isFee: false });
      }
    }

    // La comisión sale de la jarra referenciada como origen (piggy_bank_id),
    // igual que en el libro contable de cuentas — nunca de la jarra destino.
    const fee = parseFloat(String(tx.fee || 0));
    if (fee > 0 && isSrcJar) {
      const unitUsdRate = nativeAmount > 0 ? amountUsd / nativeAmount : 0;
      entries.push({
        key: `${tx.id}-fee`,
        date: tx.date,
        description: `Comisión de "${tx.description || typeLabelEs[tx.type] || tx.type}"`,
        amountUsd: fee * unitUsdRate,
        nativeAmount: fee,
        nativeCurrency,
        isIn: false,
        isFee: true,
      });
    }
  }
  return entries;
}

// Saldo en la moneda propia de la jarra: arranca en initial_amount (ya está en
// la moneda de la jarra) y convierte cada movimiento (vía su amount_usd, el
// valor ya calculado server-side) a esa misma moneda — la misma fuente que
// alimenta el libro contable, para que nunca haya dos cifras distintas.
export function computeJarFinalBalance(jar: PiggyBank, txs: Transaction[], rates: ExchangeRate[]): number {
  let bal = parseFloat(String(jar.initial_amount ?? 0));
  for (const e of buildJarEntries(jar.id, txs)) {
    const native = usdToCurrencyClient(e.amountUsd, jar.currency, rates, e.date);
    bal += e.isIn ? native : -native;
  }
  return bal;
}

// Saldo de la jarra expresado en USD "a tasa histórica" — análogo a
// computeAccountHistoricalUsdBasis. Como las entradas de jarra ya cargan
// amountUsd directamente (no requieren prorrateo adicional), esta suma es
// literalmente la misma que ya se usaba para el libro contable en USD.
export function computeJarHistoricalUsdBasis(jar: PiggyBank, txs: Transaction[], rates: ExchangeRate[]): number {
  const initialDate = jar.start_date || jar.created_at?.split('T')[0] || null;
  let bal = toUSDClient(parseFloat(String(jar.initial_amount ?? 0)), jar.currency, rates, initialDate);
  for (const e of buildJarEntries(jar.id, txs)) {
    bal += e.isIn ? e.amountUsd : -e.amountUsd;
  }
  return bal;
}

// ─── Calidad de datos ─────────────────────────────────────────────────

// Detecta transacciones donde toUSD() no encontró ninguna tasa y devolvió el
// monto sin convertir (misma moneda numérica, distinta unidad) — la señal de
// que esa transacción no se puede incluir de forma confiable en un cálculo
// histórico en USD.
export function transactionMissingRate(tx: Transaction): boolean {
  if (tx.currency === 'USD' || tx.currency === 'USDT') return false;
  const amount = parseFloat(String(tx.amount));
  const amountUsd = parseFloat(String(tx.amount_usd));
  return amount > 0 && amount === amountUsd;
}
