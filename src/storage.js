// Couche de stockage. Toute l'application passe par un « dépôt » qui expose
// trois méthodes asynchrones :
//
//   loadAll()           → { initialized, tasks, days, settings }
//   write(changes)      → enregistre { tasks?, deleteTaskIds?, days?, settings?, initialized? }
//                         en une seule transaction
//   replaceAll(data)    → remplace toutes les données (import d'une sauvegarde)
//
// IndexedDB est utilisé en priorité. Si le navigateur le refuse, on se replie
// sur localStorage, puis sur la mémoire (avec un avertissement à l'écran).
// Pour ajouter plus tard une synchronisation entre appareils, il suffira
// d'écrire un nouveau dépôt respectant la même interface.

const DB_NAME = 'routine-tdah';
const DB_VERSION = 1;
const STORES = ['tasks', 'days', 'meta'];

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB indisponible'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tasks')) db.createObjectStore('tasks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Base de données bloquée par un autre onglet'));
  });
}

function runTransaction(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, mode);
    const stores = Object.fromEntries(STORES.map((name) => [name, tx.objectStore(name)]));
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction annulée'));
    Promise.resolve(fn(stores)).then((value) => { result = value; }, (err) => {
      tx.abort();
      reject(err);
    });
  });
}

function applyChanges(stores, { tasks = [], deleteTaskIds = [], days = [], settings, initialized }) {
  for (const task of tasks) stores.tasks.put(task);
  for (const id of deleteTaskIds) stores.tasks.delete(id);
  for (const day of days) stores.days.put(day);
  if (settings) stores.meta.put({ key: 'settings', value: settings });
  if (initialized) stores.meta.put({ key: 'initialized', value: true });
}

async function createIndexedDbRepository() {
  const db = await openDatabase();
  // Si une version plus récente de l'app ouvre la base, on libère la connexion.
  db.onversionchange = () => db.close();

  return {
    kind: 'indexeddb',
    loadAll: () => runTransaction(db, 'readonly', async (s) => {
      const [tasks, days, meta] = await Promise.all([
        request(s.tasks.getAll()), request(s.days.getAll()), request(s.meta.getAll()),
      ]);
      const metaMap = new Map(meta.map((m) => [m.key, m.value]));
      return {
        initialized: metaMap.get('initialized') === true,
        tasks,
        days,
        settings: metaMap.get('settings') ?? {},
      };
    }),
    write: (changes) => runTransaction(db, 'readwrite', (s) => applyChanges(s, changes)),
    replaceAll: ({ tasks, days, settings }) => runTransaction(db, 'readwrite', (s) => {
      s.tasks.clear();
      s.days.clear();
      s.meta.clear();
      applyChanges(s, { tasks, days, settings, initialized: true });
    }),
  };
}

// Dépôt synchrone en mémoire, éventuellement recopié dans localStorage.
function createSimpleRepository(kind, persistSnapshot, initial) {
  const data = {
    initialized: initial?.initialized === true,
    tasks: new Map((initial?.tasks ?? []).map((t) => [t.id, t])),
    days: new Map((initial?.days ?? []).map((d) => [d.date, d])),
    settings: initial?.settings ?? {},
  };
  const snapshot = () => ({
    initialized: data.initialized,
    tasks: [...data.tasks.values()],
    days: [...data.days.values()],
    settings: data.settings,
  });
  const clone = (v) => JSON.parse(JSON.stringify(v));

  return {
    kind,
    loadAll: async () => clone(snapshot()),
    write: async ({ tasks = [], deleteTaskIds = [], days = [], settings, initialized }) => {
      for (const task of tasks) data.tasks.set(task.id, clone(task));
      for (const id of deleteTaskIds) data.tasks.delete(id);
      for (const day of days) data.days.set(day.date, clone(day));
      if (settings) data.settings = clone(settings);
      if (initialized) data.initialized = true;
      persistSnapshot(snapshot());
    },
    replaceAll: async ({ tasks, days, settings }) => {
      data.tasks = new Map(tasks.map((t) => [t.id, clone(t)]));
      data.days = new Map(days.map((d) => [d.date, clone(d)]));
      data.settings = clone(settings);
      data.initialized = true;
      persistSnapshot(snapshot());
    },
  };
}

const LS_KEY = 'routine-tdah:data';

function createLocalStorageRepository() {
  const raw = localStorage.getItem(LS_KEY);
  const probe = `${LS_KEY}:probe`;
  localStorage.setItem(probe, '1');
  localStorage.removeItem(probe);
  return createSimpleRepository(
    'localstorage',
    (snap) => localStorage.setItem(LS_KEY, JSON.stringify(snap)),
    raw ? JSON.parse(raw) : null,
  );
}

export function createMemoryRepository(initial) {
  return createSimpleRepository('memory', () => {}, initial);
}

export async function openRepository() {
  try {
    const repo = await createIndexedDbRepository();
    await repo.loadAll();
    return repo;
  } catch (err) {
    console.warn('IndexedDB indisponible, repli sur localStorage.', err);
  }
  try {
    return createLocalStorageRepository();
  } catch (err) {
    console.warn('localStorage indisponible, données conservées en mémoire uniquement.', err);
  }
  return createMemoryRepository();
}
