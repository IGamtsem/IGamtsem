// IndexedDB storage. Each log entry is written on its own, keyed by UUID, so a repeated write of the
// same entry overwrites instead of duplicating (spec §15: idempotent key, local transaction first).

const DB_NAME = 'volleystats';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('teams')) db.createObjectStore('teams', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('matches')) db.createObjectStore('matches', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('entries')) {
        const s = db.createObjectStore('entries', { keyPath: 'id' });
        s.createIndex('matchId', 'matchId');
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(storeNames, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeNames, mode);
        let result;
        Promise.resolve(fn(tx)).then((r) => {
          result = r;
        });
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('Транзакция прервана'));
      })
  );
}

const req = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export const getAll = (store) => run([store], 'readonly', (tx) => req(tx.objectStore(store).getAll()));

export const get = (store, key) => run([store], 'readonly', (tx) => req(tx.objectStore(store).get(key)));

export const put = (store, value) => run([store], 'readwrite', (tx) => req(tx.objectStore(store).put(value)));

export const putMany = (store, values) =>
  run([store], 'readwrite', (tx) => {
    const s = tx.objectStore(store);
    for (const v of values) s.put(v);
  });

export const remove = (store, key) => run([store], 'readwrite', (tx) => req(tx.objectStore(store).delete(key)));

export const entriesOf = (matchId) =>
  run(['entries'], 'readonly', (tx) => req(tx.objectStore('entries').index('matchId').getAll(matchId)));

export function deleteMatch(matchId) {
  return run(['matches', 'entries'], 'readwrite', async (tx) => {
    tx.objectStore('matches').delete(matchId);
    const store = tx.objectStore('entries');
    const keys = await req(store.index('matchId').getAllKeys(matchId));
    for (const k of keys) store.delete(k);
  });
}

/** Replaces a match and its whole log in one transaction (used by JSON restore). */
export function replaceMatch(match, entries) {
  return run(['matches', 'entries'], 'readwrite', async (tx) => {
    const store = tx.objectStore('entries');
    const keys = await req(store.index('matchId').getAllKeys(match.id));
    for (const k of keys) store.delete(k);
    tx.objectStore('matches').put(match);
    for (const e of entries) store.put(e);
  });
}

export function requestPersistence() {
  navigator.storage?.persist?.().catch(() => {});
}
