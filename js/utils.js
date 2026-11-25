// Fonctions pures : dates, récurrences, mise en page, progression.

export const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const MAX_OCCURRENCES = 1000;

export const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const timeKey = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "YYYY-MM-DD" ou "YYYY-MM-DDTHH:mm" (heure locale) → Date, sinon null. */
export function parseLocal(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(String(value ?? ''));
  if (!match) return null;
  const [, y, m, d, h = '0', mi = '0'] = match;
  return new Date(+y, +m - 1, +d, +h, +mi);
}

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

export function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
}

/** Ajoute n mois en ramenant le jour au dernier jour du mois si besoin (31 jan → 28/29 fév). */
export function addMonths(d, n) {
  const lastDay = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), lastDay), d.getHours(), d.getMinutes());
}

/** Lundi de la semaine contenant d. */
export const startOfWeek = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
export const monthGridStart = (d) => startOfWeek(new Date(d.getFullYear(), d.getMonth(), 1));
export const sameDay = (a, b) => dateKey(a) === dateKey(b);
export const daysUntil = (target, from) => Math.round((startOfDay(target) - startOfDay(from)) / DAY_MS);

export function formatDate(d, options) {
  return new Intl.DateTimeFormat('fr-FR', options).format(d);
}

const REPEAT_STEPS = {
  daily: (d, i) => addDays(d, i),
  weekly: (d, i) => addDays(d, 7 * i),
  monthly: (d, i) => addMonths(d, i),
  yearly: (d, i) => addMonths(d, 12 * i),
};
const REPEAT_MIN_DAYS = { daily: 1, weekly: 7, monthly: 31, yearly: 366 };

const overlaps = (start, end, rangeStart, rangeEnd) =>
  start < rangeEnd && (end > rangeStart || start >= rangeStart);

/** Index de départ sûr (jamais trop loin) pour éviter d'itérer depuis la 1re occurrence. */
function firstIndex(repeat, start, rangeStart, duration) {
  const from = +rangeStart - duration;
  if (from <= +start) return 0;
  return Math.max(0, Math.floor((from - start) / DAY_MS / REPEAT_MIN_DAYS[repeat]) - 1);
}

/** Occurrences d'un événement (récurrent ou non) qui touchent [rangeStart, rangeEnd). */
export function occurrencesInRange(event, rangeStart, rangeEnd) {
  const start = parseLocal(event.start);
  const end = parseLocal(event.end);
  if (!start || !end) return [];
  const duration = Math.max(0, end - start);
  const step = REPEAT_STEPS[event.repeat];
  if (!step) {
    return overlaps(start, end, rangeStart, rangeEnd) ? [{ ...event, start, end, key: event.id }] : [];
  }
  const until = event.repeatUntil ? parseLocal(event.repeatUntil) : null;
  const limit = until ? endOfDay(until) : null;
  const first = firstIndex(event.repeat, start, rangeStart, duration);
  const out = [];
  for (let i = first; i < first + MAX_OCCURRENCES; i += 1) {
    const s = step(start, i);
    if (s >= rangeEnd || (limit && s > limit)) break;
    const e = new Date(+s + duration);
    if (overlaps(s, e, rangeStart, rangeEnd)) out.push({ ...event, start: s, end: e, key: `${event.id}:${i}` });
  }
  return out;
}

/**
 * Rappels à déclencher : occurrences dont l'heure de rappel (début − event.reminder minutes)
 * tombe dans (from, to]. event.reminder vide ou absent = pas de rappel.
 */
export function dueReminders(events, from, to) {
  return events.flatMap((event) => {
    if (event.reminder === '' || event.reminder == null) return [];
    const minutes = Number(event.reminder);
    if (!Number.isFinite(minutes) || minutes < 0) return [];
    const offset = minutes * MINUTE_MS;
    return occurrencesInRange(event, new Date(+from + offset), new Date(+to + offset + 1))
      .map((occ) => ({ event, start: occ.start, minutes, fireAt: new Date(occ.start - offset) }))
      .filter((r) => r.fireAt > from && r.fireAt <= to)
      .map((r) => ({ ...r, key: `${event.id}:${+r.start}:${minutes}` }));
  });
}

/** Répartit des blocs qui se chevauchent en colonnes (comme Google Agenda). */
export function layoutColumns(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const result = [];
  let cluster = [];
  let columnEnds = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    cluster.forEach(({ item, col }) => result.push({ ...item, col, cols: columnEnds.length }));
    cluster = [];
    columnEnds = [];
    clusterEnd = -Infinity;
  };
  for (const item of sorted) {
    if (cluster.length && +item.start >= clusterEnd) flush();
    let col = columnEnds.findIndex((end) => end <= +item.start);
    if (col === -1) col = columnEnds.length;
    columnEnds[col] = +item.end;
    cluster.push({ item, col });
    clusterEnd = Math.max(clusterEnd, +item.end);
  }
  if (cluster.length) flush();
  return result;
}

/** Progression d'un objectif entre 0 et 1. */
export function goalProgress(goal) {
  if (goal.achieved) return 1;
  const target = Number(goal.target);
  if (target > 0) return Math.min(1, Math.max(0, Number(goal.current || 0) / target));
  const steps = goal.steps ?? [];
  if (steps.length) return steps.filter((s) => s.done).length / steps.length;
  return 0;
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/** Minuscules sans accents, pour la recherche. */
export const searchable = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function domainColor(name) {
  let hue = 0;
  for (const ch of String(name)) hue = (hue * 31 + ch.codePointAt(0)) % 360;
  return `hsl(${hue} 45% 40%)`;
}

export const minutesBetween = (a, b) => (b - a) / MINUTE_MS;
