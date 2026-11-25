// Rappels même application fermée : le serveur Cloudflare ne reçoit que les HEURES des rappels.
// Les détails (titre, lieu) restent sur l'appareil, dans une copie que le service worker lit
// pour compléter la notification.

import { PUSH } from './config.js';
import { remindable } from './reminders.js';
import { DAY_MS, dueReminders, reminderMessage } from './utils.js';

const WINDOW_DAYS = 30;
const SYNC_DELAY_MS = 1500;
const SYNC_KEY = 'consilium:push-sync';
export const SNAPSHOT_CACHE = 'consilium-data';
const snapshotUrl = () => new URL('__consilium/rappels.json', document.baseURI).href;

/**
 * Rappels des 30 prochains jours (rendez-vous et échéances d'objectifs), avec le texte exact
 * de la notification que le service worker affichera.
 */
export function upcomingReminders(items, now) {
  return dueReminders(items, now, new Date(+now + WINDOW_DAYS * DAY_MS)).map((r) => ({
    key: r.key, fireAt: +r.fireAt, ...reminderMessage(r),
    url: r.event.kind === 'goal' ? './#/objectifs' : './#/agenda',
  }));
}

export function pushStatus() {
  if (!PUSH.serverUrl) return 'not-configured';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (Notification.permission !== 'granted') return 'needs-permission';
  return 'ready';
}

export function lastPushSync() {
  try {
    return Number(window.localStorage.getItem(SYNC_KEY)) || 0;
  } catch {
    return 0;
  }
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(PUSH.vapidPublicKey) });
}

async function saveSnapshot(items) {
  const cache = await caches.open(SNAPSHOT_CACHE);
  await cache.put(snapshotUrl(), new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } }));
}

/** Met à jour la copie locale puis envoie les heures au serveur. */
export async function syncPush(state) {
  const items = upcomingReminders(remindable(state), new Date());
  if ('caches' in window) await saveSnapshot(items);
  if (pushStatus() !== 'ready') return false;
  const subscription = await currentSubscription();
  const response = await fetch(`${PUSH.serverUrl}/reminders`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint, times: [...new Set(items.map((i) => i.fireAt))] }),
  });
  if (!response.ok) throw new Error(`Serveur de rappels indisponible (erreur ${response.status}).`);
  window.localStorage.setItem(SYNC_KEY, String(Date.now()));
  return true;
}

/** Synchronise au démarrage, après chaque modification et au retour dans l'application. */
export function startPushSync(store) {
  let timer;
  const sync = () => syncPush(store.getState()).catch((err) => console.error('Synchronisation des rappels impossible', err));
  sync();
  store.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(sync, SYNC_DELAY_MS);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  return { sync };
}
