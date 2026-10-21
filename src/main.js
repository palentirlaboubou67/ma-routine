import { openRepository } from './storage.js';
import { createStore } from './store.js';
import { mountApp } from './ui/app.js';
import { h } from './ui/dom.js';

async function start() {
  const root = document.getElementById('app');
  try {
    const repo = await openRepository();
    const store = createStore(repo);
    await store.init();
    mountApp(root, store);
  } catch (err) {
    console.error(err);
    root.replaceChildren(h('div', { class: 'fatal card' },
      h('p', { class: 'empty-title' }, 'L’application n’a pas pu démarrer'),
      h('p', { class: 'empty-text' }, 'Recharge la page. Si le problème continue, vérifie que ton navigateur autorise le stockage des données pour ce site.'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => location.reload() }, 'Recharger'),
    ));
  } finally {
    root.removeAttribute('aria-busy');
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker non enregistré', err));
  }
}

start();
