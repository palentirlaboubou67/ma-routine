// Évolutions de la routine appliquées une seule fois aux données existantes.
//
// La liste de tâches vit sur l'appareil (IndexedDB) : pour faire évoluer la
// routine d'une personne qui utilise déjà l'app, on ne peut pas se contenter de
// changer les tâches par défaut. Chaque migration est rejouée au démarrage tant
// qu'elle n'est pas notée comme appliquée. Elles sont aussi idempotentes : une
// tâche déjà présente (même titre, même moment) n'est jamais ajoutée deux fois.
//
// Une migration décrit une disposition : pour chaque emplacement, le moment,
// le titre, l'icône et le rang dans le moment. Les tâches existantes de même
// titre sans moment prennent l'emplacement ; les emplacements libres créent
// une nouvelle tâche (comptée à partir de sa date de création, donc sans
// effet sur les journées passées).

import { arrangeTasks, makeTask, MOMENTS } from './model.js';

const slots = (moment, entries, firstRank = 0) => entries.map(([title, icon], i) => ({
  moment, title, icon, rank: firstRank + i,
}));

export const MIGRATIONS = [
  {
    id: '2026-10-22-moments',
    // Tâche personnalisée inconnue et sans moment : rangée le soir.
    fallbackMoment: 'soir',
    layout: [
      ...slots('matin', [
        ['Me laver / prendre ma douche', 'shower'],
        ['Me brosser les dents', 'tooth'],
        ['Faire mon lit', 'bed'],
        ['Pompes : 5 répétitions × 3 séries', 'sport'],
        ['Abdos : 100', 'sport'],
        ['Squats : 20', 'sport'],
      ]),
      ...slots('midi', [
        ['Manger un repas', 'meal'],
        ['Manger au moins un fruit ou un légume', 'apple'],
        ['Me brosser les dents', 'tooth'],
        ['Faire la vaisselle — première session', 'dishes'],
        ['Faire le ménage', 'broom'],
      ]),
      ...slots('soir', [
        ['Faire mon sport de la journée', 'sport'],
        ['Faire la vaisselle — deuxième session', 'dishes'],
        ['Me brosser les dents', 'tooth'],
      ]),
    ],
  },
  {
    id: '2026-10-22-toute-la-journee',
    fallbackMoment: 'journee',
    layout: [
      // Les titres sont volontairement écrits tels quels (« Br » compris).
      ...slots('journee', [
        ['Pas de Br', 'heart'],
        ["Pas d'alcool", 'water'],
      ]),
      // À la fin du soir, après les tâches déjà présentes.
      ...slots('soir', [['Dodo avant 23 h', 'moon']], Number.MAX_SAFE_INTEGER),
    ],
  },
];

const AFTER_LAYOUT = 1_000_000;

function applyLayout(tasks, { layout, fallbackMoment }, now) {
  const free = [...layout];
  const ranked = arrangeTasks(tasks).map((task) => {
    const index = free.findIndex((slot) => slot.title === task.title
      && (task.moment ? slot.moment === task.moment : true));
    if (index >= 0) {
      const [slot] = free.splice(index, 1);
      return { task: task.moment ? task : { ...task, moment: slot.moment }, rank: slot.rank };
    }
    const moment = task.moment ?? fallbackMoment;
    return { task: task.moment ? task : { ...task, moment }, rank: AFTER_LAYOUT + task.order };
  });
  for (const slot of free) {
    ranked.push({ task: makeTask({ title: slot.title, icon: slot.icon, moment: slot.moment }, now), rank: slot.rank });
  }
  const momentOf = (id) => MOMENTS.findIndex((m) => m.id === id);
  ranked.sort((a, b) => momentOf(a.task.moment) - momentOf(b.task.moment) || a.rank - b.rank);
  return arrangeTasks(ranked.map(({ task }, i) => (task.order === i ? task : { ...task, order: i })));
}

// Renvoie { tasks, applied, changed }.
export function runMigrations(tasks, applied = [], now = new Date().toISOString()) {
  let result = tasks;
  const done = [...applied];
  for (const migration of MIGRATIONS) {
    if (done.includes(migration.id)) continue;
    result = applyLayout(result, migration, now);
    done.push(migration.id);
  }
  return { tasks: result, applied: done, changed: done.length !== applied.length };
}
