import { create } from 'zustand';
import { db } from './db';
import type { Account, Category, PiggyBank, Liability, ExchangeRate } from '@/types';

interface AppStore {
  accounts: Account[];
  categories: Category[];
  jars: PiggyBank[];
  liabilities: Liability[];
  exchangeRates: ExchangeRate[];
  initialized: boolean;

  init: () => Promise<void>;
  refresh: () => Promise<void>;

  // Accounts
  addAccount: (a: Account) => void;
  updateAccount: (id: string, a: Account) => void;
  removeAccount: (id: string) => void;

  // Categories
  addCategory: (c: Category) => void;
  updateCategory: (id: string, c: Category) => void;
  removeCategory: (id: string) => void;

  // Jars
  addJar: (j: PiggyBank) => void;
  updateJar: (id: string, j: PiggyBank) => void;

  // Liabilities
  addLiability: (l: Liability) => void;
  updateLiability: (id: string, l: Liability) => void;
  removeLiability: (id: string) => void;
  archiveLiabilityInStore: (id: string) => void;

  // Rates
  setRates: (r: ExchangeRate[]) => void;
  addOrUpdateRate: (r: ExchangeRate) => void;
}

// Reused so concurrent refresh() callers (nav change + visibility regain +
// post-mutation sync firing close together) share one in-flight fetch instead
// of triggering duplicate query bursts.
let refreshInFlight: Promise<void> | null = null;

export const useAppStore = create<AppStore>((set, get) => ({
  accounts: [],
  categories: [],
  jars: [],
  liabilities: [],
  exchangeRates: [],
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    const [accounts, categories, jars, liabilities, exchangeRates] = await Promise.all([
      db.accounts.list(),
      db.categories.list(),
      db.piggyBanks.list(),
      db.liabilities.list(),
      db.exchangeRates.getAll(),
    ]);
    set({ accounts, categories, jars, liabilities, exchangeRates, initialized: true });
  },

  refresh: async () => {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      const [accounts, categories, jars, liabilities, exchangeRates] = await Promise.all([
        db.accounts.list(),
        db.categories.list(),
        db.piggyBanks.list(),
        db.liabilities.list(),
        db.exchangeRates.getAll(),
      ]);
      set({ accounts, categories, jars, liabilities, exchangeRates });
    })();
    try {
      await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  },

  // ── Accounts ──────────────────────────────────────────────
  addAccount: (a) => set(s => ({ accounts: [...s.accounts, a].sort((x, y) => x.name.localeCompare(y.name)) })),
  updateAccount: (id, a) => set(s => ({ accounts: s.accounts.map(x => x.id === id ? a : x) })),
  removeAccount: (id) => set(s => ({ accounts: s.accounts.filter(x => x.id !== id) })),

  // ── Categories ────────────────────────────────────────────
  addCategory: (c) => set(s => ({ categories: [...s.categories, c].sort((x, y) => x.name.localeCompare(y.name)) })),
  updateCategory: (id, c) => set(s => ({ categories: s.categories.map(x => x.id === id ? c : x) })),
  removeCategory: (id) => set(s => ({ categories: s.categories.filter(x => x.id !== id) })),

  // ── Jars ──────────────────────────────────────────────────
  addJar: (j) => set(s => ({ jars: [...s.jars, j].sort((x, y) => x.name.localeCompare(y.name)) })),
  updateJar: (id, j) => set(s => ({ jars: s.jars.map(x => x.id === id ? j : x) })),

  // ── Liabilities ───────────────────────────────────────────
  addLiability: (l) => set(s => ({ liabilities: [...s.liabilities, l].sort((x, y) => x.name.localeCompare(y.name)) })),
  updateLiability: (id, l) => set(s => ({ liabilities: s.liabilities.map(x => x.id === id ? l : x) })),
  removeLiability: (id) => set(s => ({ liabilities: s.liabilities.filter(x => x.id !== id) })),
  archiveLiabilityInStore: (id) => set(s => ({ liabilities: s.liabilities.filter(x => x.id !== id) })),

  // ── Exchange Rates ─────────────────────────────────────────
  setRates: (r) => set({ exchangeRates: r }),
  addOrUpdateRate: (r) => set(s => {
    const key = (x: ExchangeRate) => `${x.from_currency}→${x.to_currency}→${x.date}`;
    const existing = s.exchangeRates.findIndex(x => key(x) === key(r));
    if (existing >= 0) {
      const updated = [...s.exchangeRates];
      updated[existing] = r;
      return { exchangeRates: updated };
    }
    return { exchangeRates: [r, ...s.exchangeRates] };
  }),
}));
