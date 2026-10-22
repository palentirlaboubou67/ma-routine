// Utilitaires de date. Toutes les clés de jour sont calculées dans le
// fuseau horaire local de l'appareil, au format AAAA-MM-JJ.

export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return dateKey(parseKey(value)) === value;
}

export function addDays(key, delta) {
  const date = parseKey(key);
  date.setDate(date.getDate() + delta);
  return dateKey(date);
}

// Millisecondes restantes avant minuit (heure locale).
export function msUntilNextDay(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const longFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const longFormatWithYear = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

// « Mercredi 21 octobre »
export function formatLong(key) {
  return capitalize(longFormat.format(parseKey(key)));
}

// Libellé d'une journée passée : « Hier », sinon la date complète.
export function formatPastDay(key, todayKey) {
  if (key === addDays(todayKey, -1)) return 'Hier';
  const sameYear = key.slice(0, 4) === todayKey.slice(0, 4);
  return capitalize((sameYear ? longFormat : longFormatWithYear).format(parseKey(key)));
}

const shortFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const narrowWeekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'narrow' });

// « mer. 22 oct. »
export function formatShort(key) {
  return shortFormat.format(parseKey(key));
}

// « M » (initiale du jour de la semaine)
export function weekdayInitial(key) {
  return narrowWeekday.format(parseKey(key)).toUpperCase();
}

// « 22/10 »
export function formatDayMonth(key) {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

export function greetingFor(hour) {
  if (hour >= 5 && hour < 12) return 'Bonjour';
  if (hour >= 12 && hour < 18) return 'Bon après-midi';
  return 'Bonsoir';
}
