import { createBrowserStore, type OfflineStore } from './storage';

// Instancia única del almacenamiento del teléfono (se abre una sola vez).
let storePromise: Promise<OfflineStore> | null = null;

export function getStore(): Promise<OfflineStore> {
  storePromise ??= createBrowserStore();
  return storePromise;
}
