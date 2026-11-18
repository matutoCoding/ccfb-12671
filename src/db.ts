// IndexedDB 持久化(零依赖封装, 整个软件不依赖后端)
import type { AppState } from './types.js';

const DB_NAME = 'powder-coat-sim';
const DB_VER = 1;
const STORES = ['parts', 'pending', 'presets', 'tanks', 'records', 'settings'] as const;
type StoreName = typeof STORES[number];

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putAll(store: StoreName, items: { id: string }[]): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    for (const it of items) s.put(it);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const req = t.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function clearStore(store: StoreName): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function del(store: StoreName, id: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function saveSetting(id: string, value: unknown): Promise<void> {
  await putAll('settings', [{ id, ...(typeof value === 'object' && value !== null ? value as object : { value }) } as { id: string }]);
}

export async function getSetting<T>(id: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction('settings', 'readonly');
    const req = t.objectStore('settings').get(id);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** 全量导出(方案打包发车间) */
export async function exportAll(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), app: 'powder-coat-sim', version: 1 };
  for (const s of STORES) out[s] = await getAll(s);
  return out;
}

/** 全量导入 */
export async function importAll(data: Record<string, unknown>): Promise<void> {
  for (const s of STORES) {
    const arr = data[s];
    if (Array.isArray(arr)) {
      await clearStore(s);
      await putAll(s, arr.filter(x => x && typeof x === 'object' && 'id' in x) as { id: string }[]);
    }
  }
}

export type { AppState, StoreName };
