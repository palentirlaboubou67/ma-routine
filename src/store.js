// État de l'application + actions. Chaque action met à jour l'état en mémoire
// (l'interface réagit immédiatement) puis enregistre la modification.

import { dateKey } from './date.js';
import { runMigrations } from './migrations.js';
import {
  arrangeTasks, buildExport, cleanTitle, createDay, DEFAULT_MOMENT, makeDefaultTasks, makeTask,
  moveTask as moveInList, sameItems, sanitizeImport, syncDay, toggleItem,
} from './model.js';

const DEFAULT_SETTINGS = { name: '' };

export function createStore(repo, { now = () => new Date() } = {}) {
  let state = {
    tasks: [],
    days: new Map(),
    settings: { ...DEFAULT_SETTINGS },
    migrations: [],
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
    const stamp = now().toISOString();
    let tasks = arrangeTasks(data.tasks);
    const changes = { days: [] };
    if (!data.initialized) {
      tasks = makeDefaultTasks(stamp);
      changes.tasks = tasks;
      changes.initialized = true;
    }
    const migrated = runMigrations(tasks, data.migrations ?? [], stamp);
    if (migrated.changed) {
      const before = new Map(tasks.map((t) => [t.id, t]));
      changes.tasks = migrated.tasks.filter((t) => changes.initialized || before.get(t.id) !== t);
      changes.migrations = migrated.applied;
      tasks = migrated.tasks;
    }
    const days = new Map(data.days.map((d) => [d.date, d]));
    const today = dateKey(now());
    const existing = days.get(today);
    const day = existing ? syncDay(existing, tasks) : createDay(today, tasks);
    days.set(today, day);
    if (!existing || !sameItems(existing, day)) changes.days.push(day);
    if (changes.tasks || changes.days.length) await repo.write(changes);
    setState({
      tasks, days, today, migrations: migrated.applied, settings: { ...DEFAULT_SETTINGS, ...data.settings },
    });
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
  // Seules les tâches modifiées (nouvel objet) sont réenregistrées.
  function commitTasks(tasks, { deleteTaskIds = [] } = {}) {
    checkDayChange();
    const before = new Map(state.tasks.map((t) => [t.id, t]));
    const arranged = arrangeTasks(tasks);
    const changed = arranged.filter((t) => before.get(t.id) !== t);
    const day = syncDay(todayRecord(), arranged);
    const days = new Map(state.days);
    days.set(day.date, day);
    setState({ tasks: arranged, days });
    save({ tasks: changed, deleteTaskIds, days: [day] });
  }

  function updateTask(taskId, patch) {
    const stamp = now().toISOString();
    let found = false;
    const tasks = state.tasks.map((t) => {
      if (t.id !== taskId) return t;
      found = true;
      return { ...t, ...patch, updatedAt: stamp };
    });
    if (found) commitTasks(tasks);
  }

  // Les nouvelles tâches (ou celles qui changent de moment) vont à la fin du moment.
  const END = Number.MAX_SAFE_INTEGER;

  function addTask({ title, icon, moment = DEFAULT_MOMENT }) {
    const clean = cleanTitle(title);
    if (!clean) return null;
    const task = makeTask({ title: clean, icon, moment, order: END }, now().toISOString());
    commitTasks([...state.tasks, task]);
    return state.tasks.find((t) => t.id === task.id);
  }

  function setTaskMoment(taskId, moment) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (task && task.moment !== moment) updateTask(taskId, { moment, order: END });
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
    const tasks = moveInList(state.tasks, taskId, delta);
    if (tasks.some((t, i) => t !== state.tasks[i])) commitTasks(tasks);
  }

  function deleteTask(taskId) {
    const remaining = state.tasks.filter((t) => t.id !== taskId);
    if (remaining.length === state.tasks.length) return;
    commitTasks(remaining, { deleteTaskIds: [taskId] });
  }

  function setName(name) {
    const settings = { ...state.settings, name: cleanTitle(name).slice(0, 40) };
    if (settings.name === state.settings.name) return;
    setState({ settings });
    save({ settings });
  }

  function exportData() {
    return buildExport({
      tasks: state.tasks,
      days: [...state.days.values()].sort((a, b) => a.date.localeCompare(b.date)),
      settings: state.settings,
      migrations: state.migrations,
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
    setTaskMoment,
    moveTask,
    deleteTask,
    setName,
    exportData,
    importData,
  };
}
