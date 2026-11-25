// Fenêtre modale de formulaire, notifications et exécution d'actions avec gestion d'erreur.

import { escapeHtml } from './utils.js';

const TOAST_MS = 3000;

export function createUi() {
  const dialog = document.getElementById('modal');
  const toastEl = document.getElementById('toast');
  let toastTimer;

  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  function toast(message, tone = 'info') {
    toastEl.textContent = message;
    toastEl.className = `toast show${tone === 'error' ? ' error' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, TOAST_MS);
  }

  function reportError(err) {
    console.error(err);
    toast(err instanceof Error ? err.message : 'Une erreur inattendue est survenue.', 'error');
  }

  /** Exécute une action ; affiche le message de succès ou l'erreur. */
  function run(action, successMessage) {
    try {
      action();
      if (successMessage) toast(successMessage);
    } catch (err) {
      reportError(err);
    }
  }

  /**
   * Ouvre un formulaire. onSubmit(formData, form) lève une Error pour refuser la saisie.
   * @param {{title:string, html:string, submitLabel?:string, onSubmit:Function, onDelete?:Function, onMount?:Function}} opts
   */
  function openForm({ title, html, submitLabel = 'Enregistrer', onSubmit, onDelete, onMount }) {
    dialog.innerHTML = `
      <form class="modal-form">
        <header class="modal-head">
          <h2>${escapeHtml(title)}</h2>
          <button type="button" class="icon-btn" data-close aria-label="Fermer">×</button>
        </header>
        <div class="modal-content">${html}</div>
        <footer class="modal-foot">
          ${onDelete ? '<button type="button" class="btn btn-danger" data-delete>Supprimer</button>' : ''}
          <span class="spacer"></span>
          <button type="button" class="btn" data-close>Annuler</button>
          <button type="submit" class="btn btn-primary">${escapeHtml(submitLabel)}</button>
        </footer>
      </form>`;
    const form = dialog.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        onSubmit(new FormData(form), form);
        dialog.close();
      } catch (err) {
        reportError(err);
      }
    });
    dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));
    dialog.querySelector('[data-delete]')?.addEventListener('click', () => {
      if (!window.confirm('Supprimer définitivement cet élément ?')) return;
      run(() => { onDelete(); dialog.close(); }, 'Élément supprimé');
    });
    onMount?.(form);
    dialog.showModal();
    form.querySelector('input:not([type=hidden]):not([type=checkbox]), select, textarea')?.focus();
  }

  return { toast, run, openForm, reportError };
}

/** Texte nettoyé d'un champ de formulaire. */
export const field = (fd, name) => String(fd.get(name) ?? '').trim();

/** Options <select> à partir d'un objet {clé: {label}} ou {clé: libellé}. */
export function optionsHtml(entries, selected) {
  return Object.entries(entries)
    .map(([value, v]) => {
      const label = typeof v === 'string' ? v : v.label;
      return `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .join('');
}
