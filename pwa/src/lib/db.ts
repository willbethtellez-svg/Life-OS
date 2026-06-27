import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'lifeos';
const DB_VERSION = 1;

type StoreName = 'pendingTransactions' | 'exchangeRates' | 'householdTasks' | 'maintenanceLogs' | 'vehicleRecords' | 'babyRecords' | 'syncQueue';

interface SyncQueueItem {
  id?: number;
  action: 'create' | 'update' | 'delete';
  endpoint: string;
  body: Record<string, unknown>;
  timestamp: number;
  retries: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pendingTransactions')) {
          const store = db.createObjectStore('pendingTransactions', { keyPath: 'id' });
          store.createIndex('confirmed', 'confirmed');
          store.createIndex('synced', 'synced');
          store.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('exchangeRates')) {
          const store = db.createObjectStore('exchangeRates', { keyPath: ['date', 'from', 'to'] });
          store.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('householdTasks')) {
          db.createObjectStore('householdTasks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('maintenanceLogs')) {
          db.createObjectStore('maintenanceLogs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('vehicleRecords')) {
          db.createObjectStore('vehicleRecords', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('babyRecords')) {
          db.createObjectStore('babyRecords', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
      },
    });
  }
  return dbPromise;
}

async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await getDb();
  return db.getAll(store);
}

async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await getDb();
  return db.get(store, key);
}

async function set<T>(store: StoreName, key: IDBValidKey, value: T): Promise<void> {
  const db = await getDb();
  await db.put(store, value);
}

async function del(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await getDb();
  await db.delete(store, key);
}

async function clear(store: StoreName): Promise<void> {
  const db = await getDb();
  await db.clear(store);
}

export const localDB = {
  pendingTransactions: {
    getAll: () => getAll<import('@/types').PendingTransaction>('pendingTransactions'),
    get: (id: string) => get<import('@/types').PendingTransaction>('pendingTransactions', id),
    set: (tx: import('@/types').PendingTransaction) => set('pendingTransactions', tx.id, tx),
    delete: (id: string) => del('pendingTransactions', id),
    getPending: async () => {
      const db = await getDb();
      const index = db.transaction('pendingTransactions').store.index('confirmed');
      return index.getAll(IDBKeyRange.only(false));
    },
    getUnsynced: async () => {
      const db = await getDb();
      const index = db.transaction('pendingTransactions').store.index('synced');
      return index.getAll(IDBKeyRange.only(false));
    },
  },
  exchangeRates: {
    getAll: () => getAll<import('@/types').ExchangeRate>('exchangeRates'),
    get: (date: string, from: string, to: string) =>
      get<import('@/types').ExchangeRate>('exchangeRates', [date, from, to]),
    set: (rate: import('@/types').ExchangeRate) =>
      set('exchangeRates', [rate.date, rate.from, rate.to], rate),
    getByDate: async (date: string) => {
      const db = await getDb();
      const index = db.transaction('exchangeRates').store.index('date');
      return index.getAll(date);
    },
  },
  householdTasks: {
    getAll: () => getAll<import('@/types').HouseholdTask>('householdTasks'),
    set: (task: import('@/types').HouseholdTask) => set('householdTasks', task.id, task),
    delete: (id: string) => del('householdTasks', id),
  },
  maintenanceLogs: {
    getAll: () => getAll<import('@/types').MaintenanceLog>('maintenanceLogs'),
    set: (log: import('@/types').MaintenanceLog) => set('maintenanceLogs', log.id, log),
    delete: (id: string) => del('maintenanceLogs', id),
  },
  vehicleRecords: {
    getAll: () => getAll<import('@/types').VehicleRecord>('vehicleRecords'),
    set: (record: import('@/types').VehicleRecord) => set('vehicleRecords', record.id, record),
    delete: (id: string) => del('vehicleRecords', id),
  },
  babyRecords: {
    getAll: () => getAll<import('@/types').BabyRecord>('babyRecords'),
    set: (record: import('@/types').BabyRecord) => set('babyRecords', record.id, record),
    delete: (id: string) => del('babyRecords', id),
  },
  syncQueue: {
    getAll: () => getAll<SyncQueueItem>('syncQueue'),
    add: (item: Omit<SyncQueueItem, 'id' | 'timestamp'>) => {
      const dbPromise = getDb();
      return dbPromise.then(db => db.add('syncQueue', { ...item, timestamp: Date.now() }));
    },
    remove: (id: number) => del('syncQueue', id),
    clear: () => clear('syncQueue'),
  },
};
