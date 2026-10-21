// Écran « Réglages » : gérer ses habitudes, son prénom et ses données.

import { dateKey } from '../date.js';
import { TITLE_MAX_LENGTH } from '../model.js';
import { h, reconcile } from './dom.js';
import { confirmDialog, pickIcon, toast } from './feedback.js';
import { icon } from './icons.js';

// Champ de titre sur plusieurs lignes si besoin (les intitulés longs restent
// lisibles sur téléphone). Entrée valide au lieu d'ajouter un retour à la ligne.
const autoSizeSupported = globalThis.CSS?.supports?.('field-sizing', 'content');
function autoSize(textarea) {
  if (autoSizeSupported) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}
function titleField(props) {
  const field = h('textarea', { rows: '1', maxlength: String(TITLE_MAX_LENGTH), autocomplete: 'off', enterkeyhint: 'done', ...props });
  field.addEventListener('input', () => {
    if (field.value.includes('\n')) field.value = field.value.replace(/\n/g, ' ');
    autoSize(field);
  });
  return field;
}

const STORAGE_NOTES = {
  indexeddb: 'Tout est enregistré automatiquement sur cet appareil, à chaque modification.',
  localstorage: 'Tout est enregistré automatiquement sur cet appareil (stockage simplifié du navigateur).',
  memory: 'Le stockage de ce navigateur est indisponible : tes données seront perdues à la fermeture. Exporte-les pour les garder.',
};

export function createSettingsView(store, { onBack }) {
  // ----- Liste des habitudes -----
  const listEl = h('ul', { class: 'habits', 'aria-label': 'Mes habitudes' });
  const emptyEl = h('p', { class: 'habits-empty', hidden: true }, 'Ta liste est vide. Ajoute ta première habitude ci-dessous.');

  function createRow(task) {
    const id = task.id;
    const iconBtn = h('button', {
      class: 'habit-icon', type: 'button', 'aria-label': 'Changer l’icône', title: 'Changer l’icône',
      onclick: async () => {
        const current = store.getState().tasks.find((t) => t.id === id);
        const chosen = await pickIcon(current?.icon);
        if (chosen) store.setTaskIcon(id, chosen);
        iconBtn.focus();
      },
    });
    const input = titleField({ class: 'habit-input', 'aria-label': 'Nom de l’habitude' });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        input.value = store.getState().tasks.find((t) => t.id === id)?.title ?? input.value;
        input.blur();
      }
    });
    input.addEventListener('change', () => {
      const current = store.getState().tasks.find((t) => t.id === id);
      if (!input.value.trim()) {
        input.value = current?.title ?? '';
        toast('Le nom d’une habitude ne peut pas être vide.');
        return;
      }
      store.renameTask(id, input.value);
    });

    const toggle = h('input', { type: 'checkbox', role: 'switch', class: 'switch-input' });
    const toggleLabel = h('span', { class: 'switch-text' });
    toggle.addEventListener('change', () => store.setTaskActive(id, toggle.checked));

    const move = (delta, self, other) => () => {
      store.moveTask(id, delta);
      (self.disabled ? other : self).focus();
    };
    const upBtn = h('button', { class: 'icon-btn icon-btn-sm', type: 'button', 'aria-label': 'Monter', title: 'Monter' }, icon('up', { size: 18 }));
    const downBtn = h('button', { class: 'icon-btn icon-btn-sm', type: 'button', 'aria-label': 'Descendre', title: 'Descendre' }, icon('down', { size: 18 }));
    upBtn.addEventListener('click', move(-1, upBtn, downBtn));
    downBtn.addEventListener('click', move(1, downBtn, upBtn));

    const deleteBtn = h('button', {
      class: 'icon-btn icon-btn-sm icon-btn-danger', type: 'button', 'aria-label': 'Supprimer', title: 'Supprimer',
      onclick: async () => {
        const current = store.getState().tasks.find((t) => t.id === id);
        if (!current) return;
        const ok = await confirmDialog({
          title: 'Supprimer cette habitude ?',
          message: `« ${current.title} » sera retirée de ta liste. Tes journées passées restent intactes. Tu peux aussi simplement la mettre en pause.`,
          confirmLabel: 'Supprimer',
          danger: true,
        });
        if (ok) {
          store.deleteTask(id);
          toast('Habitude supprimée.');
        } else deleteBtn.focus();
      },
    }, icon('trash', { size: 18 }));

    const row = h('li', { class: 'card habit' },
      h('div', { class: 'habit-main' }, iconBtn, input),
      h('div', { class: 'habit-actions' },
        h('label', { class: 'switch' }, toggle, h('span', { class: 'switch-track', 'aria-hidden': 'true' }), toggleLabel),
        h('span', { class: 'habit-buttons' }, upBtn, downBtn, deleteBtn),
      ),
    );
    row._refs = { iconBtn, input, toggle, toggleLabel, upBtn, downBtn };
    return row;
  }

  function updateRow(row, task, index, count) {
    const { iconBtn, input, toggle, toggleLabel, upBtn, downBtn } = row._refs;
    if (row._icon !== task.icon) {
      iconBtn.replaceChildren(icon(task.icon));
      row._icon = task.icon;
    }
    if (document.activeElement !== input && input.value !== task.title) input.value = task.title;
    autoSize(input);
    toggle.checked = task.active;
    toggle.setAttribute('aria-label', `${task.title} : ${task.active ? 'active' : 'en pause'}`);
    toggleLabel.textContent = task.active ? 'Active' : 'En pause';
    row.classList.toggle('is-paused', !task.active);
    upBtn.disabled = index === 0;
    downBtn.disabled = index === count - 1;
  }

  // ----- Ajout d'une habitude -----
  let newIcon = 'check';
  const newIconBtn = h('button', {
    class: 'habit-icon', type: 'button', 'aria-label': 'Choisir l’icône', title: 'Choisir l’icône',
    onclick: async () => {
      const chosen = await pickIcon(newIcon);
      if (chosen) {
        newIcon = chosen;
        newIconBtn.replaceChildren(icon(newIcon));
      }
      newIconBtn.focus();
    },
  }, icon(newIcon));
  const newInput = titleField({
    class: 'habit-input', placeholder: 'Ex. Boire un grand verre d’eau', 'aria-label': 'Nom de la nouvelle habitude',
  });
  const addBtn = h('button', { class: 'btn btn-primary', type: 'submit', disabled: true }, icon('plus', { size: 18 }), 'Ajouter');
  newInput.addEventListener('input', () => { addBtn.disabled = !newInput.value.trim(); });
  newInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addForm.requestSubmit();
    }
  });
  const addForm = h('form', { class: 'card add-form' },
    h('div', { class: 'habit-main' }, newIconBtn, newInput),
    addBtn,
  );
  addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const task = store.addTask({ title: newInput.value, icon: newIcon });
    if (!task) return;
    newInput.value = '';
    autoSize(newInput);
    addBtn.disabled = true;
    newIcon = 'check';
    newIconBtn.replaceChildren(icon(newIcon));
    newInput.focus();
    toast(`« ${task.title} » ajoutée à ta journée.`);
  });

  // ----- Prénom -----
  const nameInput = h('input', {
    class: 'field-input', type: 'text', maxlength: '40', autocomplete: 'given-name', id: 'setting-name',
    placeholder: 'Facultatif',
  });
  nameInput.addEventListener('change', () => store.setName(nameInput.value));
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });

  // ----- Données -----
  const storageNote = h('p', { class: 'section-text' });
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      toast('Ce fichier n’est pas lisible.', { tone: 'warning' });
      return;
    }
    const ok = await confirmDialog({
      title: 'Restaurer cette sauvegarde ?',
      message: 'Tes habitudes et ton historique actuels seront remplacés par ceux du fichier.',
      confirmLabel: 'Restaurer',
    });
    if (!ok) return;
    try {
      await store.importData(data);
      toast('Sauvegarde restaurée.');
    } catch (err) {
      toast(err.message || 'Impossible de restaurer ce fichier.', { tone: 'warning' });
    }
  });

  function exportData() {
    const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: `ma-routine-${dateKey()}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Sauvegarde téléchargée.');
  }

  const el = h('section', { class: 'view view-settings' },
    h('header', { class: 'view-header view-header-back' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Retour', title: 'Retour', onclick: onBack }, icon('back')),
      h('h1', { class: 'title title-sm' }, 'Réglages'),
    ),

    h('section', { class: 'section' },
      h('h2', { class: 'section-title' }, 'Mes habitudes'),
      h('p', { class: 'section-text' }, 'Les changements s’appliquent dès aujourd’hui. Ton historique reste intact. Une habitude en pause n’est plus comptée dans ta progression.'),
      listEl,
      emptyEl,
      addForm,
    ),

    h('section', { class: 'section' },
      h('h2', { class: 'section-title' }, h('label', { for: 'setting-name' }, 'Ton prénom')),
      h('p', { class: 'section-text' }, 'Utilisé uniquement pour le message d’accueil.'),
      nameInput,
    ),

    h('section', { class: 'section' },
      h('h2', { class: 'section-title' }, 'Mes données'),
      storageNote,
      h('div', { class: 'data-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: exportData }, icon('download', { size: 18 }), 'Exporter une sauvegarde'),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => fileInput.click() }, icon('upload', { size: 18 }), 'Restaurer une sauvegarde'),
        fileInput,
      ),
    ),
  );

  function update(state) {
    const tasks = state.tasks;
    reconcile(listEl, tasks, (t) => t.id, createRow, (row, task) => updateRow(row, task, tasks.indexOf(task), tasks.length));
    emptyEl.hidden = tasks.length > 0;
    listEl.hidden = tasks.length === 0;
    if (document.activeElement !== nameInput) nameInput.value = state.settings.name;
    storageNote.textContent = STORAGE_NOTES[state.storageKind] ?? STORAGE_NOTES.indexeddb;
    storageNote.classList.toggle('is-warning', state.storageKind === 'memory');
  }

  return { el, update };
}
