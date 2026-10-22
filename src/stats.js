// Statistiques du tableau de bord (logique pure, testée dans tests/).
//
// Règles :
// - Une journée ouverte compte avec la photo enregistrée ce jour-là.
// - Une journée où l'app n'a pas été ouverte compte comme 0 % : on y attend
//   les tâches actives qui existaient déjà à cette date, aucune n'étant faite.
// - Une tâche n'est attendue qu'à partir de sa date de création : ajouter une
//   activité ne fait pas baisser les pourcentages des jours précédents.
// - Les périodes commencent au plus tôt au premier jour enregistré.

import { addDays, dateKey } from './date.js';
import { momentIndex, momentInfo, progressOf } from './model.js';

const sinceKey = (task) => dateKey(new Date(task.createdAt));

function itemsFor(date, days, tasks) {
  const day = days.get(date);
  if (day) return { opened: true, items: day.items };
  const items = tasks
    .filter((t) => t.active && sinceKey(t) <= date)
    .map((t) => ({ taskId: t.id, title: t.title, icon: t.icon, moment: t.moment, done: false, doneAt: null }));
  return { opened: false, items };
}

export function firstDay(days, today) {
  let first = today;
  for (const key of days.keys()) if (key < first) first = key;
  return first;
}

// Liste des dates de la période (les `span` derniers jours, aujourd'hui inclus).
export function periodDates(days, today, span) {
  const start = addDays(today, -(span - 1));
  const first = firstDay(days, today);
  const dates = [];
  for (let d = first > start ? first : start; d <= today; d = addDays(d, 1)) dates.push(d);
  return dates;
}

const percent = (done, total) => (total === 0 ? 0 : Math.round((done / total) * 100));

export function computeStats({ days, tasks, today }, span) {
  const taskMoment = new Map(tasks.map((t) => [t.id, t.moment]));
  const momentOf = (item) => item.moment ?? taskMoment.get(item.taskId);

  const perDay = periodDates(days, today, span).map((date) => {
    const { opened, items } = itemsFor(date, days, tasks);
    return { date, opened, items, ...progressOf({ items }) };
  });

  const average = perDay.length
    ? Math.round(perDay.reduce((sum, d) => sum + d.percent, 0) / perDay.length)
    : 0;

  const momentTotals = new Map();
  const taskTotals = new Map();
  for (const day of perDay) {
    for (const item of day.items) {
      const id = momentInfo(momentOf(item)).id;
      const m = momentTotals.get(id) ?? { done: 0, total: 0 };
      m.total += 1;
      if (item.done) m.done += 1;
      momentTotals.set(id, m);

      const t = taskTotals.get(item.taskId) ?? { done: 0, total: 0 };
      t.total += 1;
      if (item.done) t.done += 1;
      taskTotals.set(item.taskId, t);
    }
  }

  const moments = [...momentTotals.entries()]
    .sort(([a], [b]) => momentIndex(a) - momentIndex(b))
    .map(([id, { done, total }]) => ({ ...momentInfo(id), done, total, percent: percent(done, total) }));

  // Par activité : les tâches actives, dans l'ordre de la routine.
  const activities = tasks
    .filter((t) => t.active && taskTotals.has(t.id))
    .map((t) => {
      const { done, total } = taskTotals.get(t.id);
      return { taskId: t.id, title: t.title, icon: t.icon, moment: t.moment, done, total, percent: percent(done, total) };
    });

  return { days: perDay, average, moments, activities };
}

// Nombre de jours d'affilée à 100 %. La journée en cours ne casse pas la
// série tant qu'elle n'est pas finie : elle ne compte que lorsqu'elle est à 100 %.
export function currentStreak({ days, today }) {
  const todayComplete = progressOf(days.get(today)).complete;
  let date = todayComplete ? today : addDays(today, -1);
  let streak = 0;
  for (;;) {
    const day = days.get(date);
    if (!day || !progressOf(day).complete) break;
    streak += 1;
    date = addDays(date, -1);
  }
  return { streak, includesToday: todayComplete };
}
