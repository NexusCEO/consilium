// Sauvegarde / restauration et installation de l'application.

import { dateKey } from './utils.js';

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
  };
  root.onchange = (e) => { if (e.target.matches('[data-act=import]')) importBackup(ctx, e.target); };
}
