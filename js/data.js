// Sauvegarde / restauration et installation de l'application.

import { downloadIcs } from './ics.js';
import { lastPushSync, pushStatus } from './push.js';
import { notificationStatus, requestNotifications } from './reminders.js';
import { dateKey, formatDate } from './utils.js';

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

function exportBackup(ctx) {
  const blob = new Blob([JSON.stringify(ctx.store.getState(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `consilium-sauvegarde-${dateKey(new Date())}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  ctx.ui.toast('Sauvegarde téléchargée');
}

async function importBackup(ctx, input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    if (file.size > MAX_IMPORT_BYTES) throw new Error('Fichier trop volumineux pour une sauvegarde Consilium.');
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new Error('Ce fichier n’est pas un JSON lisible.');
    }
    if (!window.confirm('Remplacer toutes vos données actuelles par cette sauvegarde ?')) return;
    ctx.store.replaceAll(data);
    ctx.ui.toast('Sauvegarde restaurée');
  } catch (err) {
    ctx.ui.reportError(err);
  }
}

const NOTIFICATION_TEXT = {
  granted: 'Activées : vous recevrez une notification pour chaque événement qui a un rappel.',
  default: 'Pas encore activées : les rappels s’affichent seulement dans l’application.',
  denied: 'Bloquées par le navigateur. Autorisez-les dans les réglages du site (icône à gauche de l’adresse), puis rechargez.',
  unsupported: 'Ce navigateur ne gère pas les notifications. Les rappels s’affichent dans l’application.',
};

function phoneCalendarPanel(count) {
  return `<section class="panel">
      <h2>Calendrier du téléphone</h2>
      <p>Copiez vos rendez-vous dans le calendrier de votre téléphone : il vous préviendra même quand Consilium est fermé.
        Chaque événement garde son rappel et sa répétition.</p>
      <ul class="plain">
        <li><strong>iPhone</strong> : ouvrez le fichier téléchargé (dossier Téléchargements de Fichiers) → « Tout ajouter ».</li>
        <li><strong>Android (Samsung, etc.)</strong> : ouvrez le fichier téléchargé avec l’application Calendrier.</li>
        <li><strong>Google Agenda</strong> : sur ordinateur, calendar.google.com → Paramètres → Importer et exporter → choisissez le fichier. Il apparaît ensuite sur le téléphone.</li>
      </ul>
      <p class="muted">Pour un seul rendez-vous, ouvrez-le dans l’agenda : boutons « Fichier calendrier » et « Google Agenda ».
        Ce que vous modifiez ensuite dans Consilium n’est pas recopié automatiquement : exportez à nouveau (les événements déjà importés sont en général mis à jour, pas dupliqués).</p>
      <div><button type="button" class="btn btn-primary" data-act="export-ics"${count ? '' : ' disabled'}>Exporter tous les rendez-vous (${count})</button></div>
    </section>`;
}

function closedAppText() {
  const status = pushStatus();
  if (status === 'ready') {
    const last = lastPushSync();
    const when = last ? ` (synchronisé le ${formatDate(new Date(last), { dateStyle: 'short', timeStyle: 'short' })})` : '';
    return `<strong>Application fermée : rappels actifs</strong>${when}. Ouvrez Consilium au moins une fois par mois pour les garder à jour.`;
  }
  if (status === 'unsupported') return 'Application fermée : pas de rappels sur ce navigateur. Sur iPhone, ajoutez d’abord Consilium à l’écran d’accueil (iOS 16.4 ou plus).';
  if (status === 'not-configured') return 'Application fermée : rappels pas encore disponibles (serveur non configuré).';
  return 'Application fermée : activez les notifications ci-dessous pour recevoir les rappels.';
}

function notificationsPanel() {
  const status = notificationStatus();
  return `<section class="panel">
      <h2>Rappels et notifications</h2>
      <p>${NOTIFICATION_TEXT[status]}</p>
      <p>${closedAppText()}</p>
      <p class="muted">Choisissez le rappel de chaque événement dans son formulaire (15 minutes avant par défaut).
        Le serveur de rappels ne reçoit que les heures : le titre et le lieu restent sur cet appareil.</p>
      ${status === 'default' ? '<div><button type="button" class="btn btn-primary" data-act="notify">Activer les notifications</button></div>' : ''}
      ${status === 'granted' ? '<div><button type="button" class="btn" data-act="test-notify">Envoyer une notification de test</button></div>' : ''}
    </section>`;
}

async function enableNotifications(root, ctx) {
  const result = await requestNotifications();
  if (result === 'granted') await ctx.push.sync();
  ctx.ui.toast(result === 'granted' ? 'Notifications activées' : 'Notifications non autorisées', result === 'granted' ? 'info' : 'error');
  renderData(root, ctx);
}

async function testNotification(ctx) {
  const registration = await navigator.serviceWorker?.getRegistration();
  const options = { body: 'Les rappels fonctionnent.', icon: 'icons/icon-192.png', tag: 'consilium-test' };
  if (registration) await registration.showNotification('Consilium', options);
  else new Notification('Consilium', options); // eslint-disable-line no-new
}

export function renderData(root, ctx) {
  const { events, contacts, goals } = ctx.store.getState();
  const stat = (n, label) => `<div class="stat"><strong>${n}</strong><span class="muted">${label}</span></div>`;
  root.innerHTML = `
    <header class="toolbar"><h1 class="page-title">Données</h1></header>
    <section class="panel">
      <h2>Vos données</h2>
      <p class="muted">Tout est enregistré sur cet appareil, dans ce navigateur, sans compte ni serveur. Exportez une sauvegarde régulièrement et restaurez-la pour passer d’un appareil à l’autre.</p>
      <div class="stats">${stat(events.length, 'événements')}${stat(contacts.length, 'contacts')}${stat(goals.length, 'objectifs')}</div>
      <div class="toolbar-group">
        <button type="button" class="btn btn-primary" data-act="export">Exporter une sauvegarde</button>
        <label class="btn">Restaurer une sauvegarde<input type="file" accept="application/json,.json" data-act="import" hidden></label>
      </div>
    </section>
    ${phoneCalendarPanel(events.length)}
    ${notificationsPanel()}
    <section class="panel">
      <h2>Installer Consilium</h2>
      <ul class="plain">
        <li><strong>Chrome sur ordinateur</strong> : icône « Installer » à droite de la barre d’adresse.</li>
        <li><strong>Android (Chrome)</strong> : menu ⋮ → « Ajouter à l’écran d’accueil » / « Installer l’application ».</li>
        <li><strong>iPhone (Safari)</strong> : bouton Partager → « Sur l’écran d’accueil ».</li>
      </ul>
      ${ctx.install.available() ? '<div><button type="button" class="btn btn-primary" data-act="install">Installer maintenant</button></div>' : ''}
    </section>`;
  root.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'export') ctx.ui.run(() => exportBackup(ctx));
    if (act === 'install') ctx.install.prompt();
    if (act === 'export-ics') ctx.ui.run(() => downloadIcs(ctx.store.getState().events, `consilium-agenda-${dateKey(new Date())}.ics`), 'Fichier calendrier téléchargé');
    if (act === 'notify') enableNotifications(root, ctx).catch((err) => ctx.ui.reportError(err));
    if (act === 'test-notify') testNotification(ctx).catch((err) => ctx.ui.reportError(err));
  };
  root.onchange = (e) => { if (e.target.matches('[data-act=import]')) importBackup(ctx, e.target); };
}
