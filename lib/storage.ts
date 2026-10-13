import { Project } from './types';
// Minimal IndexedDB store (projects are too big for localStorage). All data stays on this device.
const DB = 'reverselearn'; const STORE = 'projects';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'id' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => { const req = fn(db.transaction(STORE, mode).objectStore(STORE)); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}
export const store = {
  all: async (): Promise<Project[]> => tx('readonly', (s) => s.getAll() as IDBRequest<Project[]>),
  put: async (p: Project) => tx('readwrite', (s) => s.put(p)),
  remove: async (id: string) => tx('readwrite', (s) => s.delete(id)),
};
