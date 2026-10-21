// Écran « Historique » : les journées passées, sans jugement.

import { formatPastDay } from '../date.js';
import { progressOf, totalDone } from '../model.js';
import { h } from './dom.js';
import { icon } from './icons.js';

function ring(percent) {
  const template = document.createElement('template');
  template.innerHTML = `<svg class="ring" viewBox="0 0 36 36" width="40" height="40" aria-hidden="true" focusable="false">
    <circle class="ring-track" cx="18" cy="18" r="15" pathLength="100"/>
    <circle class="ring-fill" cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="${percent} 100"/>
  </svg>`;
  return template.content.firstElementChild;
}

export function createHistoryView(store, { openSettings }) {
  const content = h('div', { class: 'history-content' });
  const el = h('section', { class: 'view view-history' },
    h('header', { class: 'view-header' },
      h('div', null,
        h('p', { class: 'eyebrow' }, 'Historique'),
        h('h1', { class: 'title' }, 'Tes journées'),
      ),
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'Réglages', title: 'Réglages', onclick: openSettings,
      }, icon('settings')),
    ),
    content,
  );

  // Garde ouvertes les journées dépliées d'un rendu à l'autre.
  const openDates = new Set();

  function dayEntry(day, today) {
    const p = progressOf(day);
    const details = h('details', { class: 'card day', open: openDates.has(day.date) },
      h('summary', { class: 'day-summary' },
        ring(p.percent),
        h('span', { class: 'day-text' },
          h('span', { class: 'day-date' }, formatPastDay(day.date, today)),
          h('span', { class: 'day-count' }, p.total
            ? `${p.done} sur ${p.total} · ${p.percent} %`
            : 'Aucune habitude ce jour-là'),
        ),
        icon('down', { size: 18, className: 'day-chevron' }),
      ),
      h('ul', { class: 'day-items' },
        day.items.map((item) => h('li', { class: `day-item${item.done ? ' is-done' : ''}` },
          h('span', { class: 'day-item-mark' }, item.done ? icon('check', { size: 14 }) : null),
          h('span', { class: 'day-item-icon' }, icon(item.icon, { size: 18 })),
          h('span', { class: 'day-item-title' }, item.title),
          h('span', { class: 'visually-hidden' }, item.done ? ' : faite' : ' : non cochée'),
        )),
      ),
    );
    details.addEventListener('toggle', () => {
      if (details.open) openDates.add(day.date);
      else openDates.delete(day.date);
    });
    return details;
  }

  function update(state) {
    const past = [...state.days.values()]
      .filter((day) => day.date < state.today)
      .sort((a, b) => b.date.localeCompare(a.date));

    if (past.length === 0) {
      content.replaceChildren(h('div', { class: 'empty card' },
        icon('calendar', { size: 28, className: 'empty-icon' }),
        h('p', { class: 'empty-title' }, 'Ton historique commence aujourd’hui'),
        h('p', { class: 'empty-text' }, 'Chaque journée est enregistrée automatiquement. Tu pourras la retrouver ici dès demain.'),
      ));
      return;
    }

    const done = totalDone(state.days.values());
    content.replaceChildren(
      h('section', { class: 'card summary' },
        h('p', { class: 'summary-value' }, String(done)),
        h('p', { class: 'summary-label' },
          `${done > 1 ? 'tâches accomplies' : 'tâche accomplie'} depuis ton premier jour, aujourd’hui compris.`),
      ),
      h('div', { class: 'days' }, past.map((day) => dayEntry(day, state.today))),
    );
  }

  return { el, update };
}
