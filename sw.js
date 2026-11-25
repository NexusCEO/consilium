// Réseau d'abord (toujours la dernière version), cache en secours (hors ligne).
const CACHE = 'consilium-v4';
const DATA_CACHE = 'consilium-data'; // copie locale des rappels, jamais effacée par une mise à jour
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/app.js', 'js/utils.js', 'js/store.js', 'js/constants.js', 'js/ui.js',
  'js/calendar.js', 'js/event-form.js', 'js/contacts.js', 'js/goals.js', 'js/data.js', 'js/reminders.js', 'js/ics.js',
  'js/push.js', 'js/config.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];
const ICON = 'icons/icon-192.png';
const MATCH_BEFORE_MS = 10 * 60_000;
const MATCH_AFTER_MS = 2 * 60_000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE && n !== DATA_CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('index.html'))),
  );
});

// Clic sur un rappel : ramène l'application au premier plan (ou l'ouvre) sur l'agenda.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});

// Notification reçue du serveur (vide) : on retrouve le ou les rendez-vous dans la copie locale.
const hourOf = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function reminderText(reminder) {
  const when = reminder.minutes === 0 ? 'Maintenant' : `À ${hourOf(reminder.start)}${reminder.minutes >= 1440 ? ' demain' : ''}`;
  return [when, reminder.location].filter(Boolean).join(' · ');
}

async function readSnapshot() {
  try {
    const response = await caches.match(new URL('__consilium/rappels.json', self.registration.scope).href);
    return response ? await response.json() : [];
  } catch {
    return [];
  }
}

async function showPushedReminders() {
  const now = Date.now();
  const due = (await readSnapshot()).filter((r) => r.fireAt >= now - MATCH_BEFORE_MS && r.fireAt <= now + MATCH_AFTER_MS);
  const data = { url: './#/agenda' };
  if (!due.length) {
    return self.registration.showNotification('Consilium', { body: 'Vous avez un rendez-vous bientôt.', tag: 'consilium-rappel', icon: ICON, data });
  }
  // Même « tag » que les rappels affichés par l'application ouverte : pas de doublon.
  return Promise.all(due.map((reminder) => self.registration.showNotification(`Rappel : ${reminder.title}`, {
    body: reminderText(reminder), tag: reminder.key, icon: ICON, data,
  })));
}

self.addEventListener('push', (event) => {
  event.waitUntil(showPushedReminders());
});
