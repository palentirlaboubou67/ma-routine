// Assemblage de l'interface : navigation entre les écrans et changement de jour.

import { msUntilNextDay } from '../date.js';
import { h } from './dom.js';
import { toast } from './feedback.js';
import { createDashboardView } from './dashboard.js';
import { createHistoryView } from './history.js';
import { icon } from './icons.js';
import { createSettingsView } from './settings.js';
import { createTodayView } from './today.js';

export function mountApp(root, store) {
  const main = h('main', { class: 'main', id: 'main' });
  let current = null;
  let appEntries = 0; // nombre d'entrées d'historique ajoutées par l'app

  const openSettings = () => show('settings');
  const onBack = () => {
    if (appEntries > 0) history.back();
    else show('today', { push: false });
  };

  const views = {
    today: createTodayView(store, { openSettings }),
    history: createHistoryView(store, { openSettings }),
    dashboard: createDashboardView(store, { openSettings }),
    settings: createSettingsView(store, { onBack }),
  };

  const tabs = {
    today: h('button', { class: 'tab', type: 'button', onclick: () => show('today') },
      icon('sun'), h('span', null, 'Aujourd’hui')),
    history: h('button', { class: 'tab', type: 'button', onclick: () => show('history') },
      icon('calendar'), h('span', null, 'Historique')),
    dashboard: h('button', { class: 'tab', type: 'button', onclick: () => show('dashboard') },
      icon('chart'), h('span', null, 'Bilan')),
  };
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Navigation principale' },
    tabs.today, tabs.history, tabs.dashboard);

  function show(name, { push = true } = {}) {
    if (current === name) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    current = name;
    const view = views[name];
    main.replaceChildren(view.el);
    view.el.classList.remove('view-enter');
    void view.el.offsetWidth;
    view.el.classList.add('view-enter');
    view.update(store.getState(), { entering: true });
    for (const [key, tab] of Object.entries(tabs)) {
      if (key === name) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
    window.scrollTo(0, 0);
    if (push) {
      history.pushState({ view: name }, '', name === 'today' ? location.pathname : `#${name}`);
      appEntries += 1;
    }
  }

  window.addEventListener('popstate', (e) => {
    appEntries = Math.max(0, appEntries - 1);
    show(e.state?.view ?? 'today', { push: false });
  });

  store.subscribe((state, prev) => {
    views[current]?.update(state);
    if (state.saveError && !prev.saveError) {
      toast('La dernière modification n’a pas pu être enregistrée. Réessaie dans un instant.', { tone: 'warning', duration: 5000 });
    }
  });

  // Changement de jour : vérifié régulièrement, au retour sur l'app et à minuit,
  // pour que la nouvelle journée s'affiche même si l'app est restée ouverte.
  function tick() {
    const changed = store.checkDayChange();
    if (!changed && current === 'today') views.today.update(store.getState());
  }
  let midnightTimer;
  function scheduleMidnight() {
    clearTimeout(midnightTimer);
    midnightTimer = setTimeout(() => {
      tick();
      scheduleMidnight();
    }, msUntilNextDay() + 500);
  }
  setInterval(tick, 30_000);
  scheduleMidnight();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tick();
      scheduleMidnight();
    }
  });
  window.addEventListener('focus', tick);
  window.addEventListener('pageshow', tick);

  root.replaceChildren(main, tabbar);
  // L'application s'ouvre toujours sur la journée en cours.
  history.replaceState({ view: 'today' }, '', location.pathname);
  show('today', { push: false });
}
