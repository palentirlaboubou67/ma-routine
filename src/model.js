// Logique métier pure (aucun accès au DOM ni au stockage), testée dans tests/.
//
// Modèle de données :
//   Task   { id, title, icon, moment, active, order, createdAt, updatedAt }
//   Day    { date: 'AAAA-MM-JJ', items: DayItem[], updatedAt }
//   DayItem{ taskId, title, icon, moment, done, doneAt }
//
// `moment` range la tâche dans une section de la journée (voir MOMENTS).
// Les tâches sont toujours triées par moment, puis par `order`.
//
// Chaque journée garde une copie (titre + icône) des tâches qui étaient
// actives ce jour-là : modifier ou supprimer une tâche n'altère jamais
// l'historique. Seule la journée en cours suit la liste des tâches.

import { isDateKey } from './date.js';

export const TITLE_MAX_LENGTH = 80;

// Sections de la journée, dans l'ordre d'affichage.
export const MOMENTS = [
  { id: 'matin', label: 'Matin', icon: 'sunrise' },
  { id: 'midi', label: 'Midi', icon: 'sun' },
  { id: 'soir', label: 'Soir', icon: 'moon' },
];
export const DEFAULT_MOMENT = MOMENTS[0].id;
// Pour d'anciennes données sans moment.
const OTHER_MOMENT = { id: 'autre', label: 'Autres', icon: 'check' };

export function momentInfo(id) {
  return MOMENTS.find((m) => m.id === id) ?? OTHER_MOMENT;
}

export function momentIndex(id) {
  const i = MOMENTS.findIndex((m) => m.id === id);
  return i < 0 ? MOMENTS.length : i;
}

// Regroupe des éléments ({ moment, … }) par section, dans l'ordre des MOMENTS.
export function groupByMoment(items) {
  const groups = new Map();
  for (const item of items) {
    const info = momentInfo(item.moment);
    if (!groups.has(info.id)) groups.set(info.id, { ...info, items: [] });
    groups.get(info.id).items.push(item);
  }
  return [...groups.values()].sort((a, b) => momentIndex(a.id) - momentIndex(b.id));
}

export const DEFAULT_TASKS = [
  { title: 'Me laver / prendre ma douche', icon: 'shower' },
  { title: 'Me brosser les dents', icon: 'tooth' },
  { title: 'Faire mon lit', icon: 'bed' },
  { title: 'Faire la vaisselle — première session', icon: 'dishes' },
  { title: 'Manger un repas', icon: 'meal' },
  { title: 'Manger au moins un fruit ou un légume', icon: 'apple' },
  { title: 'Faire mon sport de la journée', icon: 'sport' },
  { title: 'Faire la vaisselle — deuxième session', icon: 'dishes' },
];

export function createId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cleanTitle(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX_LENGTH);
}

export function makeTask({ title, icon = 'check', moment, order = 0 }, now = new Date().toISOString()) {
  const task = { id: createId(), title: cleanTitle(title), icon, active: true, order, createdAt: now, updatedAt: now };
  if (moment) task.moment = moment;
  return task;
}

export function makeDefaultTasks(now = new Date().toISOString()) {
  return DEFAULT_TASKS.map((t, i) => makeTask({ ...t, order: i }, now));
}

export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => momentIndex(a.moment) - momentIndex(b.moment) || a.order - b.order);
}

// Trie par moment puis par ordre, et renumérote 0..n-1.
// Les tâches dont l'ordre ne change pas gardent le même objet.
export function arrangeTasks(tasks) {
  return sortTasks(tasks).map((task, i) => (task.order === i ? task : { ...task, order: i }));
}

export function activeTasks(tasks) {
  return sortTasks(tasks).filter((t) => t.active);
}

// Aligne une journée sur la liste de tâches actives, en conservant l'état
// coché de chaque tâche déjà présente.
export function syncDay(day, tasks) {
  const previous = new Map(day.items.map((item) => [item.taskId, item]));
  const items = activeTasks(tasks).map((task) => {
    const prev = previous.get(task.id);
    return {
      taskId: task.id,
      title: task.title,
      icon: task.icon,
      moment: task.moment,
      done: prev ? prev.done : false,
      doneAt: prev ? prev.doneAt : null,
    };
  });
  return { ...day, items };
}

export function createDay(date, tasks, now = new Date().toISOString()) {
  return syncDay({ date, items: [], updatedAt: now }, tasks);
}

export function sameItems(a, b) {
  if (a.items.length !== b.items.length) return false;
  return a.items.every((item, i) => {
    const other = b.items[i];
    return item.taskId === other.taskId && item.title === other.title
      && item.icon === other.icon && item.moment === other.moment && item.done === other.done;
  });
}

export function toggleItem(day, taskId, now = new Date().toISOString()) {
  let found = false;
  const items = day.items.map((item) => {
    if (item.taskId !== taskId) return item;
    found = true;
    const done = !item.done;
    return { ...item, done, doneAt: done ? now : null };
  });
  return found ? { ...day, items, updatedAt: now } : day;
}

// Progression = tâches terminées / tâches totales × 100 (arrondi à l'entier).
export function progressOf(day) {
  const total = day ? day.items.length : 0;
  const done = day ? day.items.filter((item) => item.done).length : 0;
  return {
    done,
    total,
    remaining: total - done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    complete: total > 0 && done === total,
  };
}

export const COMPLETE_MESSAGE = 'Bravo ! Tu as pris soin de toi aujourd’hui. Tu peux être fier de toi.';

// Messages toujours encourageants, jamais culpabilisants.
export function encouragement({ done, total, remaining, complete }) {
  if (total === 0) return 'Ta liste est vide pour le moment.';
  if (complete) return COMPLETE_MESSAGE;
  if (done === 0) return 'Une chose à la fois. Commence par la plus simple.';
  if (remaining === 1) return 'Plus qu’une. Tu y es presque.';
  if (done / total < 0.5) return 'C’est parti. Chaque petite tâche compte.';
  return 'Belle avancée. Continue à ton rythme.';
}

// Déplace une tâche de `delta` positions (‑1 = monter, +1 = descendre)
// à l'intérieur de son moment.
export function moveTask(tasks, taskId, delta) {
  const sorted = arrangeTasks(tasks);
  const task = sorted.find((t) => t.id === taskId);
  if (!task) return sorted;
  const group = sorted.filter((t) => t.moment === task.moment);
  const other = group[group.indexOf(task) + delta];
  if (!other) return sorted;
  return arrangeTasks(sorted.map((t) => {
    if (t === task) return { ...t, order: other.order };
    if (t === other) return { ...t, order: task.order };
    return t;
  }));
}

export function totalDone(days) {
  let count = 0;
  for (const day of days) count += day.items.filter((item) => item.done).length;
  return count;
}

// Format d'export / import. `version` permettra de migrer plus tard
// (par exemple vers une synchronisation entre appareils).
export const EXPORT_FORMAT = 'routine-tdah';
export const EXPORT_VERSION = 1;

export function buildExport({ tasks, days, settings, migrations = [] }, now = new Date().toISOString()) {
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now, tasks, days, settings, migrations };
}

// Valide et nettoie un fichier importé. Lève une erreur lisible sinon.
export function sanitizeImport(data) {
  const fail = () => { throw new Error('Ce fichier n’est pas une sauvegarde valide de l’application.'); };
  if (!data || typeof data !== 'object' || data.format !== EXPORT_FORMAT) fail();
  if (!Array.isArray(data.tasks) || !Array.isArray(data.days)) fail();

  const now = new Date().toISOString();
  const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);

  const moment = (v) => (typeof v === 'string' && v ? { moment: v } : {});

  const tasks = arrangeTasks(data.tasks.map((t, i) => {
    if (!t || typeof t.id !== 'string' || !cleanTitle(t.title)) fail();
    return {
      id: t.id,
      title: cleanTitle(t.title),
      icon: str(t.icon, 'check'),
      ...moment(t.moment),
      active: t.active !== false,
      order: Number.isFinite(t.order) ? t.order : i,
      createdAt: str(t.createdAt, now),
      updatedAt: str(t.updatedAt, now),
    };
  }));

  const seen = new Set();
  const days = data.days.map((d) => {
    if (!d || !isDateKey(d.date) || !Array.isArray(d.items) || seen.has(d.date)) fail();
    seen.add(d.date);
    return {
      date: d.date,
      updatedAt: str(d.updatedAt, now),
      items: d.items.map((item) => {
        if (!item || typeof item.taskId !== 'string') fail();
        return {
          taskId: item.taskId,
          title: cleanTitle(item.title) || 'Tâche',
          icon: str(item.icon, 'check'),
          ...moment(item.moment),
          done: item.done === true,
          doneAt: item.done === true ? str(item.doneAt, null) : null,
        };
      }),
    };
  });

  const settings = { name: cleanTitle(data.settings?.name ?? '').slice(0, 40) };
  const migrations = Array.isArray(data.migrations) ? data.migrations.filter((m) => typeof m === 'string') : [];
  return { tasks, days, settings, migrations };
}
