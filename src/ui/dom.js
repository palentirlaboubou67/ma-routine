// Petits utilitaires DOM, sans framework.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'value') el.value = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

// Met à jour une liste d'éléments identifiés par une clé, en réutilisant les
// nœuds existants (les transitions CSS ne sont donc pas interrompues).
export function reconcile(container, items, keyOf, create, update) {
  const existing = new Map();
  for (const child of container.children) existing.set(child.dataset.key, child);

  const wanted = items.map((item) => {
    const key = String(keyOf(item));
    let el = existing.get(key);
    if (el) existing.delete(key);
    else {
      el = create(item);
      el.dataset.key = key;
    }
    update(el, item);
    return el;
  });

  for (const el of existing.values()) el.remove();
  wanted.forEach((el, i) => {
    if (container.children[i] !== el) container.insertBefore(el, container.children[i] ?? null);
  });
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Relance une animation CSS portée par une classe.
export function replayClass(el, className, duration) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  clearTimeout(el._replayTimer);
  el._replayTimer = setTimeout(() => el.classList.remove(className), duration);
}

// Fait défiler un nombre affiché de `from` à `to`.
export function tweenNumber(el, from, to, format = (n) => String(n)) {
  cancelAnimationFrame(el._tween);
  clearTimeout(el._tweenEnd);
  if (from === to || prefersReducedMotion() || document.hidden) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  const duration = 450;
  // Filet de sécurité : la valeur finale s'affiche même si le navigateur
  // suspend requestAnimationFrame (onglet en arrière-plan).
  el._tweenEnd = setTimeout(() => {
    cancelAnimationFrame(el._tween);
    el.textContent = format(to);
  }, duration + 100);
  const step = (t) => {
    const p = Math.min(1, (t - start) / duration);
    const eased = 1 - (1 - p) ** 3;
    el.textContent = format(Math.round(from + (to - from) * eased));
    if (p < 1) el._tween = requestAnimationFrame(step);
  };
  el._tween = requestAnimationFrame(step);
}
