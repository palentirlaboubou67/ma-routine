// État de l'application + actions. Chaque action met à jour l'état en mémoire
// (l'interface réagit immédiatement) puis enregistre la modification.

import { dateKey } from './date.js';
import {
  buildExport, cleanTitle, createDay, makeDefaultTasks, makeTask, moveTask as moveInList,
  normalizeOrder, sameItems, sanitizeImport, sortTasks, syncDay, toggleItem,
} from './model.js';

const DEFAULT_SETTINGS = { name: '' };

export function createStore(repo, { now = () => new Date() } = {}) {
  let state = {
    tasks: [],
    days: new Map(),
    settings: { ...DEFAULT_SETTINGS },
    today: dateKey(now()),
    storageKind: repo.kind,
    saveError: false,
  };
  const listeners = new Set();

  function setState(patch) {
    const prev = state;
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state, prev);
  }

  // Les écritures sont chaînées pour garantir leur ordre.
  let queue = Promise.resolve();
  function save(changes) {
    queue = queue
      .then(() => repo.write(changes))
      .then(() => { if (state.saveError) setState({ saveError: false }); })
      .catch((err) => {
        console.error('Échec de l’enregistrement', err);
        setState({ saveError: true });
      });
    return queue;
  }

  // Construit l'état à partir des données brutes du stockage.
  async function hydrate(data) {
    let tasks = normalizeOrder(data.tasks);
    const changes = { days: [] };
    if (!data.initialized) {
      tasks = makeDefaultTasks();
      changes.tasks = tasks;
      changes.initialized = true;
    }
    const days = new Map(data.days.map((d) => [d.date, d]));
    const today = dateKey(now());
    const existing = days.get(today);
    const day = existing ? syncDay(existing, tasks) : createDay(today, tasks);
    days.set(today, day);
    if (!existing || !sameItems(existing, day)) changes.days.push(day);
    if (changes.tasks || changes.days.length) await repo.write(changes);
    setState({ tasks, days, today, settings: { ...DEFAULT_SETTINGS, ...data.settings } });
  }

  async function init() {
    await hydrate(await repo.loadAll());
    navigator.storage?.persist?.().catch(() => {});
  }

  // Passe à la nouvelle journée si la date locale a changé.
  // Renvoie true si la journée affichée a changé.
  function checkDayChange() {
    const key = dateKey(now());
    if (key === state.today) return false;
    const days = new Map(state.days);
    const existing = days.get(key);
    const day = existing ? syncDay(existing, state.tasks) : createDay(key, state.tasks);
    days.set(key, day);
    setState({ days, today: key });
    save({ days: [day] });
    return true;
  }

  function todayRecord() {
    return state.days.get(state.today);
  }

  function toggle(taskId) {
    // Si minuit est passé sans que l'écran soit rafraîchi, on affiche
    // d'abord la nouvelle journée plutôt que de cocher la mauvaise date.
    if (checkDayChange()) return;
    const day = todayRecord();
    const next = toggleItem(day, taskId, now().toISOString());
    if (next === day) return;
    const days = new Map(state.days);
    days.set(next.date, next);
    setState({ days });
    save({ days: [next] });
  }

  // Applique une nouvelle liste de tâches et resynchronise la journée en cours.
  function commitTasks(tasks, { changed = [], deleteTaskIds = [] } = {}) {
    checkDayChange();
    const sorted = sortTasks(tasks);
    const day = syncDay(todayRecord(), sorted);
    const days = new Map(state.days);
    days.set(day.date, day);
    setState({ tasks: sorted, days });
    save({ tasks: changed, deleteTaskIds, days: [day] });
  }

  function updateTask(taskId, patch) {
    const stamp = now().toISOString();
    let changed = null;
    const tasks = state.tasks.map((t) => {
      if (t.id !== taskId) return t;
      changed = { ...t, ...patch, updatedAt: stamp };
      return changed;
    });
    if (changed) commitTasks(tasks, { changed: [changed] });
  }

  function addTask({ title, icon }) {
    const clean = cleanTitle(title);
    if (!clean) return null;
    const order = state.tasks.reduce((max, t) => Math.max(max, t.order), -1) + 1;
    const task = makeTask({ title: clean, icon, order }, now().toISOString());
    commitTasks([...state.tasks, task], { changed: [task] });
    return task;
  }

  function renameTask(taskId, title) {
    const clean = cleanTitle(title);
    const task = state.tasks.find((t) => t.id === taskId);
    if (!clean || !task || task.title === clean) return;
    updateTask(taskId, { title: clean });
  }

  function setTaskIcon(taskId, icon) {
    updateTask(taskId, { icon });
  }

  function setTaskActive(taskId, active) {
    updateTask(taskId, { active });
  }

  function moveTask(taskId, delta) {
    const before = new Map(state.tasks.map((t) => [t.id, t.order]));
    const tasks = moveInList(state.tasks, taskId, delta);
    const changed = tasks.filter((t) => before.get(t.id) !== t.order);
    if (changed.length) commitTasks(tasks, { changed });
  }

  function deleteTask(taskId) {
    const remaining = state.tasks.filter((t) => t.id !== taskId);
    if (remaining.length === state.tasks.length) return;
    const tasks = normalizeOrder(remaining);
    const before = new Map(state.tasks.map((t) => [t.id, t.order]));
    const changed = tasks.filter((t) => before.get(t.id) !== t.order);
    commitTasks(tasks, { changed, deleteTaskIds: [taskId] });
  }

  function setName(name) {
    const settings = { ...state.settings, name: cleanTitle(name).slice(0, 40) };
    if (settings.name === state.settings.name) return;
    setState({ settings });
    save({ settings });
  }

  function exportData() {
    return buildExport({
      tasks: sortTasks(state.tasks),
      days: [...state.days.values()].sort((a, b) => a.date.localeCompare(b.date)),
      settings: state.settings,
    }, now().toISOString());
  }

  async function importData(raw) {
    const data = sanitizeImport(raw);
    await queue;
    await repo.replaceAll(data);
    await hydrate({ ...data, initialized: true });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    init,
    checkDayChange,
    toggle,
    addTask,
    renameTask,
    setTaskIcon,
    setTaskActive,
    moveTask,
    deleteTask,
    setName,
    exportData,
    importData,
  };
}
