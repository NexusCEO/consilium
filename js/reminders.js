// Rappels : vérifie régulièrement les événements et affiche une notification à l'heure prévue.
// Sans serveur, les rappels partent tant que l'application est ouverte (même en arrière-plan) ;
// à la réouverture, les rappels manqués depuis moins de CATCH_UP_MS sont rattrapés.

import { DAY_MS, dueReminders, timeKey } from './utils.js';

const STATE_KEY = 'consilium:rappels';
const CHECK_EVERY_MS = 20_000;
const CATCH_UP_MS = 30 * 60_000;
const KEEP_SENT_MS = 2 * DAY_MS;

export function notificationStatus() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function requestNotifications() {
  if (!('Notification' in window)) return Promise.resolve('unsupported');
  return Notification.requestPermission();
}

function readState(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STATE_KEY) ?? '{}');
    return { lastCheck: Number(parsed.lastCheck) || 0, sent: parsed.sent && typeof parsed.sent === 'object' ? parsed.sent : {} };
  } catch {
    return { lastCheck: 0, sent: {} };
  }
}

function describe(reminder) {
  const { event, start, minutes } = reminder;
  const when = minutes === 0 ? 'Maintenant' : `À ${timeKey(start)}${minutes >= 1440 ? ' demain' : ''}`;
  return { title: `Rappel : ${event.title}`, body: [when, event.location].filter(Boolean).join(' · ') };
}

async function notify(reminder, ui) {
  const { title, body } = describe(reminder);
  if (notificationStatus() !== 'granted') {
    ui.toast(`${title} — ${body}`);
    return;
  }
  const options = { body, tag: reminder.key, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './#/agenda' } };
  // Android exige de passer par le service worker ; new Notification() y est interdit.
  const registration = await navigator.serviceWorker?.getRegistration();
  if (registration) await registration.showNotification(title, options);
  else new Notification(title, options); // eslint-disable-line no-new
}

/** Lance la vérification périodique des rappels. */
export function startReminders(store, ui, storage = window.localStorage) {
  const check = () => {
    const now = Date.now();
    const state = readState(storage);
    const from = new Date(Math.max(state.lastCheck, now - CATCH_UP_MS));
    const due = dueReminders(store.getState().events, from, new Date(now)).filter((r) => !state.sent[r.key]);
    const kept = Object.fromEntries(Object.entries(state.sent).filter(([, at]) => now - at < KEEP_SENT_MS));
    const sent = { ...kept, ...Object.fromEntries(due.map((r) => [r.key, now])) };
    storage.setItem(STATE_KEY, JSON.stringify({ lastCheck: now, sent }));
    due.forEach((r) => notify(r, ui).catch((err) => console.error('Rappel non affiché', err)));
  };
  const safeCheck = () => {
    try {
      check();
    } catch (err) {
      console.error('Vérification des rappels impossible', err);
    }
  };
  safeCheck();
  setInterval(safeCheck, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) safeCheck(); });
}
