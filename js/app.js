// Point d'entrée : routage par ancre (#/agenda…), rendu, service worker.

import { renderCalendar } from './calendar.js';
import { renderContacts } from './contacts.js';
import { renderData } from './data.js';
import { renderGoals } from './goals.js';
import { startFormAccessibility } from './form-a11y.js';
import { startPushSync } from './push.js';
import { createSync } from './sync.js';
import { startReminders } from './reminders.js';
import { createStore } from './store.js';
import { createUi } from './ui.js';

const ROUTES = { agenda: renderCalendar, contacts: renderContacts, objectifs: renderGoals, donnees: renderData };
const viewEl = document.getElementById('view');
const ui = createUi();
startFormAccessibility();
let installPrompt = null;

let store;
try {
  store = createStore(window.localStorage);
} catch (err) {
  viewEl.innerHTML = '<div class="empty">Le stockage local est bloqué dans ce navigateur (navigation privée ?). Consilium ne peut pas enregistrer vos données.</div>';
  throw err;
}

const install = {
  available: () => Boolean(installPrompt),
  async prompt() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    render();
  },
};
const sync = createSync(store);
const ctx = { store, ui, install, sync, push: { sync: () => Promise.resolve(false) } };

function currentRoute() {
  const name = window.location.hash.replace(/^#\//, '').split('/')[0];
  return ROUTES[name] ? name : 'agenda';
}

function render() {
  const route = currentRoute();
  const links = [...document.querySelectorAll('.nav [data-route]')];
  document.querySelector('.nav').style.setProperty('--active', String(Math.max(0, links.findIndex((a) => a.dataset.route === route))));
  links.forEach((a) => {
    if (a.dataset.route === route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  viewEl.onclick = null;
  viewEl.oninput = null;
  viewEl.onchange = null;
  viewEl.dataset.route = route;
  ROUTES[route](viewEl, ctx);
}

store.subscribe(render);
window.addEventListener('hashchange', () => { render(); viewEl.focus({ preventScroll: true }); });
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (currentRoute() === 'donnees') render();
});
render();
startReminders(store, ui);
ctx.push = startPushSync(store);
sync.subscribe(() => { if (currentRoute() === 'donnees') render(); });
sync.start();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.error('Service worker non enregistré', err));
}
