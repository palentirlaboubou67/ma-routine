// Tests de la logique métier et du store (sans interface).
// Ouvrir http://localhost:5317/tests/ pour les lancer.

import { addDays, dateKey, formatPastDay, isDateKey, msUntilNextDay } from '../src/date.js';
import {
  buildExport, createDay, makeDefaultTasks, makeTask, moveTask, progressOf, sanitizeImport, syncDay, toggleItem,
} from '../src/model.js';
import { MIGRATIONS, runMigrations } from '../src/migrations.js';
import { computeStats, currentStreak } from '../src/stats.js';
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
  equal(s.tasks.length, 14);
  equal(s.today, '2026-10-21');
  equal(s.days.get('2026-10-21').items.length, 14);
  const saved = await repo.loadAll();
  assert(saved.initialized && saved.tasks.length === 14 && saved.days.length === 1, 'tout est enregistré');
  equal(saved.migrations, MIGRATIONS.map((m) => m.id));
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
  const [douche, dents] = tasks;
  const sport = tasks.find((t) => t.title === 'Faire mon sport de la journée');
  store.toggle(dents.id);
  c.set('2026-10-22T10:00:00');
  store.checkDayChange();

  store.renameTask(dents.id, 'Brossage des dents');
  store.setTaskActive(sport.id, false);
  store.deleteTask(douche.id);
  const added = store.addTask({ title: '  Boire   un verre d’eau ', icon: 'water', moment: 'midi' });
  equal(added.title, 'Boire un verre d’eau');

  const s = store.getState();
  const past = s.days.get('2026-10-21');
  equal(past.items.length, 14);
  equal(past.items[1].title, 'Me brosser les dents');
  assert(past.items[1].done);
  const today = s.days.get('2026-10-22');
  equal(today.items.length, 13, '14 − 1 supprimée − 1 en pause + 1 ajoutée');
  equal(today.items[0].title, 'Brossage des dents');
  const midi = today.items.filter((i) => i.moment === 'midi');
  equal(midi[midi.length - 1].title, 'Boire un verre d’eau', 'ajoutée à la fin de son moment');

  await new Promise((r) => setTimeout(r, 0));
  const reopened = createStore(repo, { now: c.now });
  await reopened.init();
  equal(reopened.getState().tasks.length, 14, '13 restantes + 1 ajoutée');
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

// ----- Moments et migration des données existantes -----

// Données telles qu'enregistrées par la première version (sans moments).
function legacyData() {
  const tasks = makeDefaultTasks('2026-10-20T08:00:00.000Z').map(({ moment, ...t }) => t);
  tasks.push({ ...tasks[0], id: 'perso', title: 'Prendre mes médicaments', icon: 'pill', order: 8 });
  const strip = (day) => ({ ...day, items: day.items.map(({ moment, ...i }) => i) });
  const past = toggleItem(createDay('2026-10-21', tasks), tasks[1].id);
  const today = toggleItem(createDay('2026-10-22', tasks), tasks[3].id);
  return { initialized: true, migrations: [], tasks, days: [strip(past), strip(today)], settings: {} };
}

test('migration : sections, nouvelles activités, rien de perdu', async () => {
  const legacy = legacyData();
  const repo = createMemoryRepository(legacy);
  const c = clock('2026-10-22T09:00:00');
  const store = createStore(repo, { now: c.now });
  await store.init();
  const s = store.getState();
  const titles = (moment) => s.tasks.filter((t) => t.moment === moment).map((t) => t.title);
  equal(titles('matin'), ['Me laver / prendre ma douche', 'Me brosser les dents', 'Faire mon lit',
    'Pompes : 5 répétitions × 3 séries', 'Abdos : 100', 'Squats : 20']);
  equal(titles('midi'), ['Manger un repas', 'Manger au moins un fruit ou un légume', 'Me brosser les dents',
    'Faire la vaisselle — première session', 'Faire le ménage']);
  equal(titles('soir'), ['Faire mon sport de la journée', 'Faire la vaisselle — deuxième session',
    'Me brosser les dents', 'Prendre mes médicaments']);
  assert(s.tasks.find((t) => t.title === 'Me brosser les dents' && t.moment === 'matin').id === legacy.tasks[1].id,
    'la brique existante devient celle du matin');
  equal(s.tasks.filter((t) => t.title === 'Me brosser les dents').length, 3);

  const today = s.days.get('2026-10-22');
  equal(progressOf(today), { done: 1, total: 15, remaining: 14, percent: 7, complete: false });
  assert(today.items.find((i) => i.taskId === legacy.tasks[3].id).done, 'la case cochée du jour est conservée');
  equal(s.days.get('2026-10-21').items.length, 9, 'le passé ne change pas');

  // Redémarrage : pas de doublons.
  await new Promise((r) => setTimeout(r, 0));
  const again = createStore(repo, { now: c.now });
  await again.init();
  equal(again.getState().tasks.length, 15);
});

test('migration rejouée sur une sauvegarde déjà migrée : pas de doublons', () => {
  const once = runMigrations(makeDefaultTasks(), []);
  const twice = runMigrations(once.tasks, []);
  equal(twice.tasks.length, once.tasks.length);
  assert(!runMigrations(once.tasks, once.applied).changed);
});

test('réordonner reste dans le même moment', async () => {
  const store = createStore(createMemoryRepository(), { now: clock('2026-10-22T09:00:00').now });
  await store.init();
  const before = store.getState().tasks;
  const lastMatin = before.filter((t) => t.moment === 'matin').at(-1);
  store.moveTask(lastMatin.id, 1);
  equal(store.getState().tasks.map((t) => t.id), before.map((t) => t.id), 'ne passe pas au midi');
  store.moveTask(lastMatin.id, -1);
  const matin = store.getState().tasks.filter((t) => t.moment === 'matin');
  equal(matin.at(-2).id, lastMatin.id);
  store.setTaskMoment(lastMatin.id, 'soir');
  equal(store.getState().tasks.at(-1).id, lastMatin.id, 'changer de moment place la tâche à la fin');
});

// ----- Tableau de bord -----

// Trois tâches créées le 18 ; une quatrième ajoutée le 22.
function statsFixture() {
  const t = (title, moment, createdAt) => ({ ...makeTask({ title, moment }, createdAt), moment });
  const tasks = [
    t('Pompes', 'matin', '2026-10-18T08:00:00'),
    t('Dents midi', 'midi', '2026-10-18T08:00:00'),
    t('Dents soir', 'soir', '2026-10-18T08:00:00'),
  ];
  const day = (date, done, list = tasks) => {
    let d = createDay(date, list);
    for (const i of done) d = toggleItem(d, list[i].id);
    return d;
  };
  const days = new Map();
  days.set('2026-10-19', day('2026-10-19', [0, 1, 2]));
  days.set('2026-10-20', day('2026-10-20', [0, 1, 2]));
  // le 21 : app non ouverte
  const late = t('Pas d’alcool', 'soir', '2026-10-22T09:00:00');
  const all = [...tasks, late];
  days.set('2026-10-22', day('2026-10-22', [0, 3], all));
  return { tasks: all, days, today: '2026-10-22' };
}

test('bilan : jour non ouvert = 0 %, période depuis le premier jour', () => {
  const stats = computeStats(statsFixture(), 7);
  equal(stats.days.map((d) => d.date), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
  equal(stats.days.map((d) => d.percent), [100, 100, 0, 50]);
  assert(!stats.days[2].opened);
  equal(stats.days[2].total, 3, 'le 21, l’activité ajoutée le 22 n’est pas attendue');
  equal(stats.average, 63);
});

test('bilan : par moment et par activité', () => {
  const stats = computeStats(statsFixture(), 30);
  const byTitle = Object.fromEntries(stats.activities.map((a) => [a.title, [a.done, a.total, a.percent]]));
  equal(byTitle.Pompes, [3, 4, 75]);
  equal(byTitle['Dents midi'], [2, 4, 50]);
  equal(byTitle['Pas d’alcool'], [1, 1, 100], 'compté seulement depuis son ajout');
  equal(stats.moments.map((m) => [m.id, m.percent]), [['matin', 75], ['midi', 50], ['soir', 60]]);
});

test('bilan : série de jours à 100 %', () => {
  const f = statsFixture();
  equal(currentStreak(f), { streak: 0, includesToday: false }, 'le 21 non ouvert casse la série');
  f.days.set('2026-10-21', createDay('2026-10-21', f.tasks.slice(0, 3)).items.reduce(
    (d, item) => toggleItem(d, item.taskId), createDay('2026-10-21', f.tasks.slice(0, 3))));
  equal(currentStreak(f), { streak: 3, includesToday: false }, 'aujourd’hui en cours ne casse pas la série');
  let today = f.days.get('2026-10-22');
  for (const item of today.items) if (!item.done) today = toggleItem(today, item.taskId);
  f.days.set('2026-10-22', today);
  equal(currentStreak(f), { streak: 4, includesToday: true });
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
