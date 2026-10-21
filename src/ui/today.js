// Écran « Aujourd'hui » : date, progression et checklist du jour.

import { formatLong, greetingFor } from '../date.js';
import { encouragement, progressOf } from '../model.js';
import { h, reconcile, replayClass, tweenNumber } from './dom.js';
import { celebrate } from './feedback.js';
import { icon } from './icons.js';

function checkMark() {
  const template = document.createElement('template');
  template.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path class="check-mark" pathLength="1" d="M5.5 12.5l4.2 4.2L18.5 7.8"/></svg>';
  return template.content.firstElementChild;
}

export function createTodayView(store, { openSettings }) {
  const dateEl = h('p', { class: 'eyebrow' });
  const greetingEl = h('h1', { class: 'title' });

  const percentEl = h('span', { class: 'percent-value' }, '0');
  const countEl = h('p', { class: 'progress-count' });
  const fillEl = h('div', { class: 'bar-fill' });
  const barEl = h('div', {
    class: 'bar', role: 'progressbar', 'aria-label': 'Progression du jour',
    'aria-valuemin': '0', 'aria-valuemax': '100',
  }, fillEl);
  const doneChip = h('span', { class: 'chip chip-done' });
  const leftChip = h('span', { class: 'chip' });
  const messageText = h('span');
  const messageEl = h('p', { class: 'progress-message', 'aria-live': 'polite' },
    icon('sparkles', { size: 18, className: 'message-icon' }), messageText);

  const progressCard = h('section', { class: 'card progress-card', 'aria-label': 'Progression' },
    h('div', { class: 'progress-top' },
      h('p', { class: 'percent', 'aria-hidden': 'true' }, percentEl, h('span', { class: 'percent-sign' }, '%')),
      countEl,
    ),
    barEl,
    h('div', { class: 'chips' }, doneChip, leftChip),
    messageEl,
  );

  const listEl = h('ul', { class: 'tasks', 'aria-label': 'Tâches du jour' });
  const emptyEl = h('div', { class: 'empty card', hidden: true },
    icon('plus', { size: 28, className: 'empty-icon' }),
    h('p', { class: 'empty-title' }, 'Aucune habitude active'),
    h('p', { class: 'empty-text' }, 'Ajoute ou réactive une habitude pour composer ta journée.'),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: openSettings }, 'Gérer mes habitudes'),
  );

  const el = h('section', { class: 'view view-today' },
    h('header', { class: 'view-header' },
      h('div', null, dateEl, greetingEl),
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'Réglages', title: 'Réglages', onclick: openSettings,
      }, icon('settings')),
    ),
    progressCard,
    listEl,
    emptyEl,
  );

  let shownPercent = 0;
  let lastDate = null;
  let wasComplete = false;

  function createRow(item) {
    const iconSlot = h('span', { class: 'task-icon' });
    const titleEl = h('span', { class: 'task-title' });
    const nextEl = h('span', { class: 'task-next' }, 'À faire ensuite');
    const button = h('button', {
      class: 'task-btn', type: 'button', role: 'checkbox',
      onclick: () => store.toggle(item.taskId),
    },
    iconSlot,
    h('span', { class: 'task-text' }, titleEl, nextEl),
    h('span', { class: 'task-check', 'aria-hidden': 'true' }, checkMark()));
    const row = h('li', { class: 'task' }, button);
    row._refs = { iconSlot, titleEl, button };
    return row;
  }

  function updateRow(row, item, nextTaskId) {
    const { iconSlot, titleEl, button } = row._refs;
    if (row._icon !== item.icon) {
      iconSlot.replaceChildren(icon(item.icon));
      row._icon = item.icon;
    }
    if (titleEl.textContent !== item.title) titleEl.textContent = item.title;
    button.setAttribute('aria-checked', String(item.done));
    row.classList.toggle('is-done', item.done);
    row.classList.toggle('is-next', item.taskId === nextTaskId);
    // Petite animation uniquement quand on vient de cocher (pas au chargement).
    if (row._done === false && item.done) {
      replayClass(row, 'just-done', 700);
      if (navigator.userActivation?.isActive) navigator.vibrate?.(12);
    }
    row._done = item.done;
  }

  function update(state, { entering = false } = {}) {
    const day = state.days.get(state.today);
    const items = day ? day.items : [];
    const progress = progressOf(day);
    const name = state.settings.name;

    dateEl.textContent = formatLong(state.today);
    greetingEl.textContent = `${greetingFor(new Date().getHours())}${name ? `, ${name}` : ''}`;

    tweenNumber(percentEl, entering ? progress.percent : shownPercent, progress.percent);
    shownPercent = progress.percent;
    fillEl.style.width = `${progress.percent}%`;
    barEl.setAttribute('aria-valuenow', String(progress.percent));
    barEl.setAttribute('aria-valuetext', `${progress.percent} %, ${progress.done} tâches sur ${progress.total}`);
    countEl.textContent = progress.total
      ? `${progress.done} sur ${progress.total} ${progress.total > 1 ? 'tâches' : 'tâche'}`
      : 'Aucune tâche aujourd’hui';
    doneChip.textContent = `${progress.done} ${progress.done > 1 ? 'faites' : 'faite'}`;
    leftChip.textContent = progress.remaining === 0 && progress.total > 0
      ? 'Tout est fait'
      : `${progress.remaining} à faire`;
    messageText.textContent = encouragement(progress);
    progressCard.classList.toggle('is-complete', progress.complete);

    const nextItem = items.find((item) => !item.done);
    if (lastDate !== state.today) {
      // Nouvelle journée (ou premier affichage) : on repart sans animation.
      listEl.replaceChildren();
      wasComplete = progress.complete;
    }
    reconcile(listEl, items, (item) => item.taskId, createRow, (row, item) => updateRow(row, item, nextItem?.taskId));
    listEl.hidden = items.length === 0;
    emptyEl.hidden = items.length > 0;

    if (!entering && lastDate === state.today && progress.complete && !wasComplete) celebrate(progressCard);
    wasComplete = progress.complete;
    lastDate = state.today;
  }

  return { el, update };
}
