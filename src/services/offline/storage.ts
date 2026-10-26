// Almacenamiento en el teléfono (IndexedDB) para el modo sin conexión de Asistencia:
// una copia de los datos que se necesitan y una cola ("outbox") de cambios por enviar.
// Si IndexedDB no está disponible (navegación privada, etc.) se usa memoria: la app
// sigue funcionando, pero lo pendiente se pierde al cerrarla.

export interface OfflineStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  clearCache(): Promise<void>;
  addOp<T extends object>(op: T): Promise<number>;
  listOps<T extends object>(): Promise<(T & { id: number })[]>;
  removeOp(id: number): Promise<void>;
  clearOps(): Promise<void>;
}

export function createMemoryStore(): OfflineStore {
  const kv = new Map<string, unknown>();
  const ops = new Map<number, object>();
  let next = 1;
  return {
    async get<T>(key: string) {
      return structuredClone(kv.get(key)) as T | undefined;
    },
    async set(key, value) {
      kv.set(key, structuredClone(value));
    },
    async clearCache() {
      kv.clear();
    },
    async addOp(op) {
      const id = next++;
      ops.set(id, structuredClone({ ...op, id }));
      return id;
    },
    async listOps<T extends object>() {
      return [...ops.values()].map((o) => structuredClone(o)) as (T & { id: number })[];
    },
    async removeOp(id) {
      ops.delete(id);
    },
    async clearOps() {
      ops.clear();
    },
  };
}

const DB_NAME = 'nido-offline';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('kv');
        req.result.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function run<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function createBrowserStore(): Promise<OfflineStore> {
  const db = await openDb();
  if (!db) return createMemoryStore();
  return {
    get: <T,>(key: string) => run<T | undefined>(db, 'kv', 'readonly', (s) => s.get(key)),
    set: async (key, value) => {
      await run(db, 'kv', 'readwrite', (s) => s.put(value, key));
    },
    clearCache: async () => {
      await run(db, 'kv', 'readwrite', (s) => s.clear());
    },
    addOp: (op) => run<number>(db, 'outbox', 'readwrite', (s) => s.add(op)),
    listOps: <T extends object>() => run<(T & { id: number })[]>(db, 'outbox', 'readonly', (s) => s.getAll()),
    removeOp: async (id) => {
      await run(db, 'outbox', 'readwrite', (s) => s.delete(id));
    },
    clearOps: async () => {
      await run(db, 'outbox', 'readwrite', (s) => s.clear());
    },
  };
}
