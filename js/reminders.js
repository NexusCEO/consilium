// Rappels : vérifie régulièrement les rendez-vous et les échéances d'objectifs, et affiche une
// notification à l'heure prévue tant que l'application est ouverte (même en arrière-plan).
// À la réouverture, les rappels manqués depuis moins de CATCH_UP_MS sont rattrapés.
// Application fermée : c'est le serveur de rappels (push.js) qui prend le relais.

import { DAY_MS, dueReminders, goalReminderEvents, reminderMessage } from './utils.js';

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

/** Demande l'autorisation pendant le geste de l'utilisateur (exigé par les navigateurs). */
export function askForNotifications(ctx) {
  const status = notificationStatus();
  if (status === 'default') {
    requestNotifications()
      .then((result) => (result === 'granted' ? ctx.push.sync() : false))
      .catch((err) => ctx.ui.reportError(err));
  } else if (status === 'denied') {
    ctx.ui.toast('Notifications bloquées : autorisez-les dans les réglages du navigateur pour recevoir les rappels.', 'error');
  }
}

/** Tout ce qui peut déclencher un rappel : rendez-vous et échéances d'objectifs. */
export const remindable = (state) => [...state.events, ...goalReminderEvents(state.goals)];

function readState(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STATE_KEY) ?? '{}');
    return { lastCheck: Number(parsed.lastCheck) || 0, sent: parsed.sent && typeof parsed.sent === 'object' ? parsed.sent : {} };
  } catch {
    return { lastCheck: 0, sent: {} };
  }
}

async function notify(reminder, ui) {
  const { title, body } = reminderMessage(reminder);
  if (notificationStatus() !== 'granted') {
    ui.toast(`${title} — ${body}`);
    return;
  }
  const url = reminder.event.kind === 'goal' ? './#/objectifs' : './#/agenda';
  const options = { body, tag: reminder.key, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url } };
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
    const due = dueReminders(remindable(store.getState()), from, new Date(now)).filter((r) => !state.sent[r.key]);
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
