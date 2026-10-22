// Écran « Bilan » : ce qui est fait / pas fait, en pourcentages.

import { formatDayMonth, formatShort, weekdayInitial } from '../date.js';
import { momentInfo, progressOf } from '../model.js';
import { computeStats, currentStreak } from '../stats.js';
import { h } from './dom.js';
import { icon } from './icons.js';

const PERIODS = [
  { span: 7, label: '7 jours' },
  { span: 30, label: '30 jours' },
];

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

// Ligne « libellé ……… barre ……… % » réutilisée par moment et par activité.
function meterRow({ iconName, title, detail, value, note }) {
  return h('li', { class: 'meter-row' },
    h('span', { class: 'meter-icon' }, icon(iconName, { size: 18 })),
    h('span', { class: 'meter-text' },
      h('span', { class: 'meter-title' }, title),
      detail ? h('span', { class: 'meter-detail' }, detail) : null),
    h('span', { class: 'meter', 'aria-hidden': 'true' },
      h('span', { class: `meter-fill${value === 0 ? ' is-zero' : ''}`, style: `width: ${value}%` })),
    h('span', { class: 'meter-value', title: note }, `${value} %`),
    h('span', { class: 'visually-hidden' }, note ?? ''),
  );
}

function itemList(items, done) {
  return h('ul', { class: `check-list${done ? ' is-done' : ''}` },
    items.map((item) => h('li', { class: 'check-item' },
      h('span', { class: 'check-dot', 'aria-hidden': 'true' }, done ? icon('check', { size: 12 }) : null),
      h('span', { class: 'check-title' }, item.title),
      item.moment ? h('span', { class: 'check-moment' }, momentInfo(item.moment).label) : null,
    )));
}

// Colonnes : une barre par jour, hauteur = % de la journée.
function dayChart(days, today) {
  const tip = h('div', { class: 'chart-tip', role: 'status', hidden: true });
  const many = days.length > 10;
  const cols = h('div', { class: 'chart-cols', style: `--n: ${days.length}` });
  const labels = h('div', { class: 'chart-x', style: `--n: ${days.length}`, 'aria-hidden': 'true' });
  const chart = h('div', { class: `chart${many ? ' is-dense' : ''}` },
    h('div', { class: 'chart-plot' },
      h('div', { class: 'chart-grid', 'aria-hidden': 'true' },
        h('span', { class: 'grid-line', style: 'bottom: 100%' }, h('span', { class: 'grid-label' }, '100 %')),
        h('span', { class: 'grid-line', style: 'bottom: 50%' }, h('span', { class: 'grid-label' }, '50 %')),
        h('span', { class: 'grid-line is-base', style: 'bottom: 0' }, h('span', { class: 'grid-label' }, '0'))),
      cols),
    labels,
    tip);

  let active = null;
  const show = (col, day) => {
    active?.classList.remove('is-active');
    active = col;
    col.classList.add('is-active');
    const label = day.date === today ? 'Aujourd’hui' : formatShort(day.date);
    tip.replaceChildren(
      h('strong', null, `${label} · ${day.percent} %`),
      h('span', null, day.opened ? `${day.done} sur ${day.total}` : 'App non ouverte ce jour-là'));
    tip.hidden = false;
    const chartBox = chart.getBoundingClientRect();
    const colBox = col.getBoundingClientRect();
    const center = colBox.left + colBox.width / 2 - chartBox.left;
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(Math.max(center, half), chartBox.width - half)}px`;
  };
  const hide = (col) => {
    if (active !== col) return;
    col.classList.remove('is-active');
    active = null;
    tip.hidden = true;
  };

  days.forEach((day, i) => {
    const col = h('button', {
      class: `col${day.date === today ? ' is-today' : ''}`,
      type: 'button',
      'aria-label': `${formatShort(day.date)} : ${day.percent} %, ${day.done} sur ${day.total}${day.opened ? '' : ', app non ouverte'}`,
    }, h('span', { class: `col-bar${day.percent === 0 ? ' is-zero' : ''}`, style: `height: ${day.percent}%` }));
    col.addEventListener('pointerenter', () => show(col, day));
    col.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(col); });
    col.addEventListener('focus', () => show(col, day));
    col.addEventListener('blur', () => hide(col));
    col.addEventListener('click', () => show(col, day));
    cols.append(col);

    // 7 jours : l'initiale de chaque jour. 30 jours : début, milieu et aujourd'hui.
    let text = '';
    if (!many) text = weekdayInitial(day.date);
    else if (i === 0 || i === Math.floor((days.length - 1) / 2)) text = formatDayMonth(day.date);
    if (day.date === today) text = many ? 'auj.' : text;
    labels.append(h('span', { class: day.date === today ? 'is-today' : '' }, text));
  });

  return chart;
}

function dayTable(days) {
  return h('details', { class: 'chart-table' },
    h('summary', null, 'Voir le détail jour par jour'),
    h('table', null,
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Jour'), h('th', { scope: 'col' }, 'Fait'), h('th', { scope: 'col' }, '%'))),
      h('tbody', null, [...days].reverse().map((day) => h('tr', null,
        h('td', null, formatShort(day.date)),
        h('td', null, day.opened ? `${day.done} / ${day.total}` : 'non ouverte'),
        h('td', null, `${day.percent} %`)))),
    ));
}

export function createDashboardView(store, { openSettings }) {
  let span = 7;
  const content = h('div', { class: 'dashboard' });
  const el = h('section', { class: 'view view-dashboard' },
    h('header', { class: 'view-header' },
      h('div', null,
        h('p', { class: 'eyebrow' }, 'Bilan'),
        h('h1', { class: 'title' }, 'Tes progrès'),
      ),
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'Réglages', title: 'Réglages', onclick: openSettings,
      }, icon('settings')),
    ),
    content,
  );

  function update(state) {
    const today = state.days.get(state.today);
    const p = progressOf(today);
    const items = today ? today.items : [];
    const done = items.filter((i) => i.done);
    const todo = items.filter((i) => !i.done);
    const stats = computeStats(state, span);
    const { streak, includesToday } = currentStreak(state);
    const periodLabel = stats.days.length < span
      ? `depuis ton premier jour (${plural(stats.days.length, 'jour', 'jours')})`
      : `sur les ${span} derniers jours`;

    // 1. Aujourd'hui
    const todayCard = h('section', { class: 'card stat-card' },
      h('h2', { class: 'card-title' }, 'Aujourd’hui'),
      h('div', { class: 'today-figure' },
        h('p', { class: 'hero-value' }, `${p.percent}`, h('span', { class: 'percent-sign' }, '%')),
        h('p', { class: 'hero-detail' }, `${p.done} sur ${plural(p.total, 'activité', 'activités')}`)),
      h('div', {
        class: 'bar', role: 'progressbar', 'aria-label': 'Progression du jour',
        'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(p.percent),
      }, h('div', { class: 'bar-fill', style: `width: ${p.percent}%` })),
      h('div', { class: 'today-lists' },
        h('div', null,
          h('h3', { class: 'list-title' }, `Fait · ${done.length}`),
          done.length ? itemList(done, true) : h('p', { class: 'list-empty' }, 'Rien pour l’instant. Une chose à la fois.')),
        h('div', null,
          h('h3', { class: 'list-title' }, `Pas encore fait · ${todo.length}`),
          todo.length ? itemList(todo, false) : h('p', { class: 'list-empty' }, 'Tout est fait. Bravo !'))),
    );

    // 2. Série en cours
    const streakCard = h('section', { class: 'card stat-card streak-card' },
      h('span', { class: 'streak-icon' }, icon('star', { size: 22 })),
      h('div', null,
        h('p', { class: 'streak-value' }, plural(streak, 'jour', 'jours')),
        h('p', { class: 'streak-text' }, streak === 0
          ? 'Ta série démarre dès ta prochaine journée à 100 %.'
          : `d’affilée à 100 %${includesToday ? ', aujourd’hui compris' : ''}. ${includesToday ? 'Bravo !' : 'Termine aujourd’hui pour l’allonger.'}`)),
    );

    // 3. Choix de la période
    const periodSwitch = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Période' },
      PERIODS.map((period) => h('button', {
        class: 'segment', type: 'button', 'aria-pressed': String(period.span === span),
        onclick: () => {
          span = period.span;
          update(store.getState());
          content.querySelector('.segment[aria-pressed="true"]')?.focus();
        },
      }, period.label)));

    // 4. Régularité
    const regularityCard = h('section', { class: 'card stat-card' },
      h('div', { class: 'card-head' },
        h('h2', { class: 'card-title' }, 'Régularité'),
        h('p', { class: 'card-figure' }, `${stats.average} %`, h('span', null, ' en moyenne'))),
      h('p', { class: 'card-sub' }, `Pourcentage de chaque journée ${periodLabel}. Touche une barre pour le détail.`),
      dayChart(stats.days, state.today),
      dayTable(stats.days),
    );

    // 5. Par moment
    const momentsCard = h('section', { class: 'card stat-card' },
      h('h2', { class: 'card-title' }, 'Par moment'),
      h('p', { class: 'card-sub' }, `Activités faites ${periodLabel}.`),
      h('ul', { class: 'meter-list' }, stats.moments.map((m) => meterRow({
        iconName: m.icon, title: m.label, value: m.percent, note: `${m.done} sur ${m.total}`,
      }))),
    );

    // 6. Par activité
    const activitiesCard = h('section', { class: 'card stat-card' },
      h('h2', { class: 'card-title' }, 'Par activité'),
      h('p', { class: 'card-sub' }, `Part des jours où l’activité a été faite, ${periodLabel}. Une activité ajoutée récemment ne compte qu’à partir de son ajout.`),
      h('ul', { class: 'meter-list' }, stats.activities.map((a) => meterRow({
        iconName: a.icon,
        title: a.title,
        detail: `${a.moment ? `${momentInfo(a.moment).label} · ` : ''}${a.done} / ${plural(a.total, 'jour', 'jours')}`,
        value: a.percent,
        note: `${a.done} sur ${plural(a.total, 'jour', 'jours')}`,
      }))),
    );

    content.replaceChildren(todayCard, streakCard, periodSwitch, regularityCard, momentsCard, activitiesCard);
  }

  return { el, update };
}
