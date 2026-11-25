// Panneau « Synchronisation entre appareils » de la page Données.

import { escapeHtml, formatDate } from './utils.js';

const COPY_FEEDBACK_MS = 2000;
const copyTimers = new WeakMap();
let lastCopyMessage = '';

function reportCopy(button, ok) {
  const tip = button.nextElementSibling; // zone role="status", hors du bouton
  clearTimeout(copyTimers.get(button));
  let message = ok ? 'Copié' : 'Échec de la copie : sélectionnez le code à la main';
  if (message === lastCopyMessage) message += ' '; // VoiceOver ignore un message identique au précédent
  lastCopyMessage = message;
  tip.textContent = '';
  requestAnimationFrame(() => { tip.textContent = message; });
  copyTimers.set(button, setTimeout(() => { tip.textContent = ''; }, COPY_FEEDBACK_MS));
}

async function copyFrom(button, target) {
  try {
    await navigator.clipboard.writeText(target.textContent.trim());
    reportCopy(button, true);
  } catch {
    reportCopy(button, false);
  }
}

// Bouton « Copier » déclaratif (command / commandfor) ; repli au clic sur les navigateurs plus anciens.
if ('CommandEvent' in window) {
  document.addEventListener('command', (e) => { if (e.command === '--copy') copyFrom(e.source, e.target); }, true);
} else {
  document.addEventListener('click', (e) => {
    const button = e.target.closest('button[command="--copy"]');
    const target = button && document.getElementById(button.getAttribute('commandfor'));
    if (target) copyFrom(button, target);
  });
}

function statusText(status) {
  if (status.state === 'syncing') return 'Synchronisation en cours…';
  if (status.state === 'error') return `⚠︎ ${status.error}`;
  if (!status.lastSync) return 'En attente de la première synchronisation.';
  return `À jour — dernière synchronisation le ${formatDate(new Date(status.lastSync), { dateStyle: 'short', timeStyle: 'short' })}.`;
}

function offHtml() {
  return `
    <p>Retrouvez vos rendez-vous, contacts et objectifs sur l’iPhone et l’ordinateur. Les données sont
      <strong>chiffrées sur l’appareil</strong> avant l’envoi : le serveur ne peut pas les lire.</p>
    <div><button type="button" class="btn btn-primary" data-act="sync-enable">Activer sur ce premier appareil</button></div>
    <form class="sync-join" data-join>
      <label for="sync-join-code" class="field-label">Déjà activée sur un autre appareil ? Saisissez son code :</label>
      <div class="toolbar-group">
        <input id="sync-join-code" name="code" required placeholder="XXXXX-XXXXX-XXXXX-XXXXX" autocomplete="off"
          autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" class="sync-code-input">
        <button type="submit" class="btn">Rejoindre</button>
      </div>
    </form>`;
}

function onHtml(sync) {
  const status = sync.status();
  return `
    <p class="${status.state === 'error' ? 'overdue' : ''}" role="status">${escapeHtml(statusText(status))}</p>
    <div class="sync-code-box">
      <span class="field-label">Code de synchronisation</span>
      <div class="toolbar-group">
        <code id="sync-code" class="sync-code">${escapeHtml(sync.code())}</code>
        <button type="button" class="btn" command="--copy" commandfor="sync-code">Copier</button>
        <span class="copy-tip muted" role="status"></span>
      </div>
      <span class="muted">Saisissez ce code dans Consilium sur votre autre appareil (Données → Synchronisation).
        Gardez-le précieusement : sans lui, la copie en ligne est illisible. Vos données restent quoi qu’il arrive sur vos appareils.</span>
    </div>
    <div class="toolbar-group">
      <button type="button" class="btn btn-primary" data-act="sync-now"${status.state === 'syncing' ? ' aria-busy="true"' : ''}>Synchroniser maintenant</button>
      <button type="button" class="btn" data-act="sync-disable">Arrêter sur cet appareil</button>
      <button type="button" class="btn btn-danger" data-act="sync-erase">Effacer la copie en ligne</button>
    </div>`;
}

export function syncPanelHtml(sync) {
  return `<section class="panel" aria-labelledby="sync-title">
      <h2 id="sync-title">Synchronisation entre appareils</h2>
      ${sync.code() ? onHtml(sync) : offHtml()}
    </section>`;
}

/** Actions du panneau ; renvoie true si l'action a été prise en charge. */
export function handleSyncAction(act, ctx) {
  const { sync, ui } = ctx;
  if (act === 'sync-enable') {
    sync.enable().then(() => ui.toast('Synchronisation activée : saisissez le code sur votre autre appareil.')).catch(ui.reportError);
  } else if (act === 'sync-now') {
    sync.syncNow();
  } else if (act === 'sync-disable') {
    if (window.confirm('Arrêter la synchronisation sur cet appareil ? Vos données y restent.')) sync.disable();
  } else if (act === 'sync-erase') {
    if (window.confirm('Effacer la copie en ligne ? Les autres appareils ne seront plus synchronisés. Les données restent sur chaque appareil.')) {
      sync.eraseOnline().then(() => ui.toast('Copie en ligne effacée')).catch(ui.reportError);
    }
  } else {
    return false;
  }
  return true;
}

export function handleJoin(form, ctx) {
  const input = form.elements.code;
  ctx.sync.join(input.value)
    .then(() => ctx.ui.toast('Appareil synchronisé : vos données ont été réunies.'))
    .catch(ctx.ui.reportError);
}
