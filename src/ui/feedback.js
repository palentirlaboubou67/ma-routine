// Boîtes de dialogue, notifications discrètes et célébration.

import { h, prefersReducedMotion } from './dom.js';
import { icon, TASK_ICONS } from './icons.js';

function openDialog(build) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog' });
    let result = null;
    const close = (value) => {
      result = value;
      dialog.close();
    };
    dialog.append(build(close));
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    // Un clic sur le fond ferme la boîte de dialogue.
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close(null);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export function confirmDialog({ title, message, confirmLabel, danger = false }) {
  return openDialog((close) => h('div', { class: 'dialog-body' },
    h('h2', { class: 'dialog-title' }, title),
    message ? h('p', { class: 'dialog-text' }, message) : null,
    h('div', { class: 'dialog-actions' },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close(false) }, 'Annuler'),
      h('button', {
        class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
        type: 'button',
        autofocus: true,
        onclick: () => close(true),
      }, confirmLabel),
    ),
  )).then(Boolean);
}

export function pickIcon(current) {
  return openDialog((close) => h('div', { class: 'dialog-body' },
    h('h2', { class: 'dialog-title' }, 'Choisir une icône'),
    h('div', { class: 'icon-grid', role: 'listbox', 'aria-label': 'Icônes' },
      TASK_ICONS.map(([name, label]) => h('button', {
        class: `icon-choice${name === current ? ' is-selected' : ''}`,
        type: 'button',
        role: 'option',
        'aria-selected': String(name === current),
        'aria-label': label,
        title: label,
        autofocus: name === current,
        onclick: () => close(name),
      }, icon(name))),
    ),
    h('div', { class: 'dialog-actions' },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close(null) }, 'Annuler'),
    ),
  ));
}

let toastRegion;
export function toast(message, { tone = 'neutral', duration = 2600 } = {}) {
  if (!toastRegion) {
    toastRegion = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastRegion);
  }
  const el = h('div', { class: `toast toast-${tone}` }, message);
  toastRegion.append(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

const CONFETTI_COLORS = ['var(--accent)', '#E9C46A', '#F2A488', '#A99CF0', '#7CC4D8'];

// Petite gerbe de confettis partant d'un élément. Elle ne capte aucun clic.
export function celebrate(origin) {
  if (prefersReducedMotion() || !origin.animate) return;
  const rect = origin.getBoundingClientRect();
  const layer = h('div', { class: 'confetti-layer', 'aria-hidden': 'true' });
  document.body.append(layer);
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const pieces = 28;
  for (let i = 0; i < pieces; i += 1) {
    const piece = h('span', { class: 'confetti' });
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    if (i % 3 === 0) piece.style.borderRadius = '50%';
    layer.append(piece);
    const angle = (Math.PI * 2 * i) / pieces + Math.random() * 0.4;
    const distance = 70 + Math.random() * 90;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 40;
    piece.animate([
      { transform: 'translate(-50%, -50%) scale(0.6) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy + 60}px)) scale(0.9) rotate(${Math.random() * 540}deg)`, opacity: 0 },
    ], { duration: 1100 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
  }
  setTimeout(() => layer.remove(), 1600);
}
