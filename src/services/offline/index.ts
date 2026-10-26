import { dataService } from '..';
import { isNetworkError, Outbox, type OutboxOp } from './outbox';
import type { OfflineStore } from './storage';
import { getStore } from './store';

export { isNetworkError, overlayAttendance, overlaySessions, pendingSessionIds } from './outbox';
export type { OutboxOp, OutboxState } from './outbox';

const online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

// La cola necesita el almacén (asíncrono); se crea con un almacén perezoso.
const lazyStore: OfflineStore = {
  get: async (k) => (await getStore()).get(k),
  set: async (k, v) => (await getStore()).set(k, v),
  clearCache: async () => (await getStore()).clearCache(),
  addOp: async (op) => (await getStore()).addOp(op),
  listOps: async () => (await getStore()).listOps(),
  removeOp: async (id) => (await getStore()).removeOp(id),
  clearOps: async () => (await getStore()).clearOps(),
};

export const outbox = new Outbox(lazyStore, dataService, online);

let started = false;
/** Arranca los envíos automáticos: al abrir, al volver la conexión, al volver a la app y cada minuto. */
export function startOfflineSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  void outbox.refresh().then(() => outbox.flush());
  window.addEventListener('online', () => void outbox.flush());
  window.addEventListener('offline', () => void outbox.refresh());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void outbox.flush());
  setInterval(() => {
    if (outbox.state.pending > 0) void outbox.flush();
  }, 60_000);
}

export interface Cached<T> {
  data: T;
  /** Si los datos vienen de la copia del teléfono: cuándo se guardaron. */
  cachedAt: number | null;
}

/**
 * Carga del servidor y guarda una copia en el teléfono; sin conexión devuelve la copia.
 */
export async function offlineFirst<T>(key: string, loader: () => Promise<T>): Promise<Cached<T>> {
  const readCache = () => getStore().then((s) => s.get<{ at: number; data: T }>(`cache:${key}`)).catch(() => undefined);
  // Si el teléfono ya sabe que no hay conexión, se usa la copia sin esperar a que falle la red.
  if (!online()) {
    const cached = await readCache();
    if (cached) return { data: cached.data, cachedAt: cached.at };
  }
  try {
    const data = await loader();
    void getStore().then((s) => s.set(`cache:${key}`, { at: Date.now(), data })).catch(() => {});
    return { data, cachedAt: null };
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const cached = await readCache();
    if (cached) return { data: cached.data, cachedAt: cached.at };
    throw new Error('Sin conexión y sin datos guardados en este teléfono para esta pantalla. Ábrela una vez con internet para poder usarla sin conexión.');
  }
}

/** Borra la copia y lo pendiente del teléfono (al cerrar sesión). */
export async function clearOfflineData() {
  const s = await getStore();
  await s.clearCache();
  await outbox.clear();
}

export type PendingOp = OutboxOp;
