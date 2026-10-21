// Tests de la logique métier et du store (sans interface).
// Ouvrir http://localhost:5317/tests/ pour les lancer.

import { addDays, dateKey, formatPastDay, isDateKey, msUntilNextDay } from '../src/date.js';
import {
  buildExport, createDay, makeDefaultTasks, moveTask, progressOf, sanitizeImport, syncDay, toggleItem,
} from '../src/model.js';
import { createMemoryRepository } from '../src/storage.js';
import { createStore } from '../src/store.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function assert(condition, message = 'assertion échouée') {
  if (!condition) throw new Error(message);
}
function equal(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message} attendu ${e}, obtenu ${a}`);
}

// Horloge contrôlable pour simuler le passage des jours.
function clock(iso) {
  let current = new Date(iso);
  return {
    now: () => new Date(current),
    set: (value) => { current = new Date(value); },
  };
}

// ----- Dates -----

test('clé de jour en heure locale', () => {
  equal(dateKey(new Date(2026, 9, 21, 23, 59)), '2026-10-21');
  equal(dateKey(new Date(2026, 9, 22, 0, 0)), '2026-10-22');
  equal(addDays('2026-12-31', 1), '2027-01-01');
  equal(addDays('2026-03-01', -1), '2026-02-28');
  assert(isDateKey('2026-02-28') && !isDateKey('2026-02-30') && !isDateKey('hier'));
});

test('minuit et libellés', () => {
  equal(msUntilNextDay(new Date(2026, 9, 21, 23, 59, 0)), 60_000);
  equal(formatPastDay('2026-10-20', '2026-10-21'), 'Hier');
  equal(formatPastDay('2026-10-19', '2026-10-21'), 'Lundi 19 octobre');
});

// ----- Modèle -----

test('8 tâches par défaut, dans le bon ordre', () => {
  const tasks = makeDefaultTasks();
  equal(tasks.length, 8);
  equal(tasks[0].title, 'Me laver / prendre ma douche');
  equal(tasks[3].title, 'Faire la vaisselle — première session');
  equal(tasks[7].title, 'Faire la vaisselle — deuxième session');
  assert(tasks[3].id !== tasks[7].id, 'les deux vaisselles ont des identifiants distincts');
});

test('progression : 0 → 0 %, 4 → 50 %, 8 → 100 %', () => {
  const tasks = makeDefaultTasks();
  let day = createDay('2026-10-21', tasks);
  equal(progressOf(day).percent, 0);
  for (const t of tasks.slice(0, 4)) day = toggleItem(day, t.id);
  equal(progressOf(day), { done: 4, total: 8, remaining: 4, percent: 50, complete: false });
  for (const t of tasks.slice(4)) day = toggleItem(day, t.id);
  equal(progressOf(day).percent, 100);
  assert(progressOf(day).complete);
  equal(progressOf(createDay('2026-10-21', [])).percent, 0, 'liste vide');
});

test('les deux sessions de vaisselle sont indépendantes', () => {
  const tasks = makeDefaultTasks();
  let day = createDay('2026-10-21', tasks);
  day = toggleItem(day, tasks[3].id);
  assert(day.items[3].done && !day.items[7].done);
  day = toggleItem(day, tasks[7].id);
  day = toggleItem(day, tasks[3].id);
  assert(!day.items[3].done && day.items[7].done);
});

test('cocher puis décocher', () => {
  const tasks = makeDefaultTasks();
  let day = createDay('2026-10-21', tasks);
  day = toggleItem(day, tasks[0].id, '2026-10-21T08:00:00.000Z');
  equal(day.items[0].doneAt, '2026-10-21T08:00:00.000Z');
  day = toggleItem(day, tasks[0].id);
  equal(day.items[0], { ...day.items[0], done: false, doneAt: null });
});

test('une tâche en pause sort de la progression du jour', () => {
  const tasks = makeDefaultTasks();
  let day = createDay('2026-10-21', tasks);
  day = toggleItem(day, tasks[0].id);
  const paused = tasks.map((t, i) => (i === 6 ? { ...t, active: false } : t));
  day = syncDay(day, paused);
  equal(progressOf(day).total, 7);
  assert(day.items[0].done, 'l’état coché est conservé');
});

test('réordonner', () => {
  const tasks = makeDefaultTasks();
  const moved = moveTask(tasks, tasks[2].id, -1);
  equal(moved.map((t) => t.order), [0, 1, 2, 3, 4, 5, 6, 7]);
  equal(moved[1].id, tasks[2].id);
  equal(moveTask(tasks, tasks[0].id, -1).map((t) => t.id), tasks.map((t) => t.id), 'déjà en haut');
});

test('import : refuse un fichier invalide, accepte un export', () => {
  let threw = false;
  try { sanitizeImport({ hello: 'world' }); } catch { threw = true; }
  assert(threw);
  const tasks = makeDefaultTasks();
  const data = buildExport({ tasks, days: [createDay('2026-10-21', tasks)], settings: { name: 'Alex' } });
  const clean = sanitizeImport(JSON.parse(JSON.stringify(data)));
  equal(clean.tasks.length, 8);
  equal(clean.days[0].items.length, 8);
  equal(clean.settings.name, 'Alex');
});

// ----- Store (état + persistance + changement de jour) -----

test('premier lancement : liste par défaut et journée créée', async () => {
  const repo = createMemoryRepository();
  const c = clock('2026-10-21T09:00:00');
  const store = createStore(repo, { now: c.now });
  await store.init();
  const s = store.getState();
  equal(s.tasks.length, 8);
  equal(s.today, '2026-10-21');
  equal(s.days.get('2026-10-21').items.length, 8);
  const saved = await repo.loadAll();
  assert(saved.initialized && saved.tasks.length === 8 && saved.days.length === 1, 'tout est enregistré');
});

test('les tâches cochées survivent à un redémarrage', async () => {
  const repo = createMemoryRepository();
  const c = clock('2026-10-21T09:00:00');
  const store = createStore(repo, { now: c.now });
  await store.init();
  const [first, , , dishes1] = store.getState().tasks;
  store.toggle(first.id);
  await store.toggle(dishes1.id);
  await new Promise((r) => setTimeout(r, 0));

  const reopened = createStore(repo, { now: c.now });
  await reopened.init();
  equal(progressOf(reopened.getState().days.get('2026-10-21')).done, 2);
});

test('nouvelle journée : liste décochée, historique conservé', async () => {
  const repo = createMemoryRepository();
  const c = clock('2026-10-21T22:00:00');
  const store = createStore(repo, { now: c.now });
  await store.init();
  for (const t of store.getState().tasks.slice(0, 5)) store.toggle(t.id);

  // L'app reste ouverte et passe minuit.
  c.set('2026-10-22T00:00:05');
  assert(store.checkDayChange(), 'changement détecté');
  const s = store.getState();
  equal(s.today, '2026-10-22');
  equal(progressOf(s.days.get('2026-10-22')).done, 0);
  equal(progressOf(s.days.get('2026-10-21')).done, 5);

  // L'app est fermée puis rouverte deux jours plus tard.
  await new Promise((r) => setTimeout(r, 0));
  c.set('2026-10-24T07:30:00');
  const reopened = createStore(repo, { now: c.now });
  await reopened.init();
  const r = reopened.getState();
  equal(r.today, '2026-10-24');
  equal(progressOf(r.days.get('2026-10-24')).done, 0);
  equal(progressOf(r.days.get('2026-10-21')).done, 5);
  equal(r.days.size, 3);
});

test('cocher après minuit sans rafraîchissement ne coche pas la veille', async () => {
  const repo = createMemoryRepository();
  const c = clock('2026-10-21T23:59:00');
  const store = createStore(repo, { now: c.now });
  await store.init();
  const id = store.getState().tasks[0].id;
  c.set('2026-10-22T00:01:00');
  store.toggle(id);
  const s = store.getState();
  equal(s.today, '2026-10-22');
  equal(progressOf(s.days.get('2026-10-21')).done, 0);
  equal(progressOf(s.days.get('2026-10-22')).done, 0);
});

test('modifier la liste ne touche pas l’historique', async () => {
  const repo = createMemoryRepository();
  const c = clock('2026-10-21T10:00:00');
  const store = createStore(repo, { now: c.now });
  await store.init();
  const tasks = store.getState().tasks;
  store.toggle(tasks[1].id);
  c.set('2026-10-22T10:00:00');
  store.checkDayChange();

  store.renameTask(tasks[1].id, 'Brossage des dents');
  store.setTaskActive(tasks[6].id, false);
  store.deleteTask(tasks[0].id);
  const added = store.addTask({ title: '  Boire   un verre d’eau ', icon: 'water' });
  equal(added.title, 'Boire un verre d’eau');

  const s = store.getState();
  const past = s.days.get('2026-10-21');
  equal(past.items.length, 8);
  equal(past.items[1].title, 'Me brosser les dents');
  assert(past.items[1].done);
  const today = s.days.get('2026-10-22');
  equal(today.items.length, 7, '8 − 1 supprimée − 1 en pause + 1 ajoutée');
  equal(today.items[0].title, 'Brossage des dents');
  equal(today.items[6].title, 'Boire un verre d’eau');

  await new Promise((r) => setTimeout(r, 0));
  const reopened = createStore(repo, { now: c.now });
  await reopened.init();
  equal(reopened.getState().tasks.length, 8, '7 restantes + 1 ajoutée');
  equal(reopened.getState().days.get('2026-10-21').items[1].title, 'Me brosser les dents');
});

test('liste entièrement supprimée : pas de réinitialisation surprise', async () => {
  const repo = createMemoryRepository();
  const c = clock('2026-10-21T10:00:00');
  const store = createStore(repo, { now: c.now });
  await store.init();
  for (const t of store.getState().tasks) store.deleteTask(t.id);
  await new Promise((r) => setTimeout(r, 0));
  const reopened = createStore(repo, { now: c.now });
  await reopened.init();
  equal(reopened.getState().tasks.length, 0);
  equal(progressOf(reopened.getState().days.get('2026-10-21')).percent, 0);
});

test('export puis import', async () => {
  const c = clock('2026-10-21T10:00:00');
  const source = createStore(createMemoryRepository(), { now: c.now });
  await source.init();
  source.toggle(source.getState().tasks[2].id);
  source.setName('Sam');
  const file = JSON.parse(JSON.stringify(source.exportData()));

  const target = createStore(createMemoryRepository(), { now: c.now });
  await target.init();
  await target.importData(file);
  const s = target.getState();
  equal(s.settings.name, 'Sam');
  equal(progressOf(s.days.get('2026-10-21')).done, 1);
});

// ----- Lancement -----

const list = document.getElementById('results');
let failed = 0;
for (const { name, fn } of tests) {
  const li = document.createElement('li');
  try {
    await fn();
    li.className = 'pass';
    li.textContent = `✓ ${name}`;
  } catch (err) {
    failed += 1;
    li.className = 'fail';
    li.textContent = `✗ ${name}`;
    const pre = document.createElement('pre');
    pre.textContent = err.stack || String(err);
    li.append(pre);
  }
  list.append(li);
}
const summary = document.getElementById('summary');
summary.textContent = failed ? `${failed} test(s) en échec sur ${tests.length}` : `${tests.length} tests réussis`;
summary.className = failed ? 'fail' : 'pass';
window.__testResult = { total: tests.length, failed };
