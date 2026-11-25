// Fenêtre modale de formulaire, notifications à l'écran et exécution d'actions avec gestion d'erreur.

import { initFields } from './form-a11y.js';
import { escapeHtml } from './utils.js';

const TOAST_MS = 4000;
const EXIT_TIMEOUT_MS = 2000;
const ANNOUNCE_DELAY_MS = 50;

let displayTransitionSupport;
/** Firefox accepte allow-discrete sans animer `display` : on teste réellement le comportement. */
function canTransitionDisplay() {
  if (displayTransitionSupport !== undefined) return displayTransitionSupport;
  if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) return false;
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = 'none';
  displayTransitionSupport = getComputedStyle(probe).display === 'block';
  probe.remove();
  return displayTransitionSupport;
}
const supportsTopLayerExit = () => Boolean(window.CSS?.supports?.('overlay', 'auto')) && canTransitionDisplay();

/** Ferme la fenêtre avec son animation de sortie, y compris là où le navigateur ne sait pas l'animer seul. */
async function closeDialog(dialog) {
  if (!dialog.open) return;
  if (!supportsTopLayerExit()) {
    dialog.setAttribute('data-closing', '');
    const animations = dialog.getAnimations({ subtree: true });
    if (animations.length) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((resolve) => { setTimeout(resolve, EXIT_TIMEOUT_MS); }),
      ]);
    }
    if (!dialog.hasAttribute('data-closing')) return; // rouverte entre-temps
    dialog.removeAttribute('data-closing');
  }
  dialog.close();
}

/** Fermeture en touchant à côté : natif avec closedby="any", sinon (Safari) on détecte le clic hors du cadre. */
function setupDismiss(dialog) {
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDialog(dialog);
  });
  if ('closedBy' in HTMLDialogElement.prototype) return;
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside = r.top <= event.clientY && event.clientY <= r.bottom && r.left <= event.clientX && event.clientX <= r.right;
    if (!inside) closeDialog(dialog);
  });
}

function createToaster(dialog) {
  const el = document.getElementById('toast');
  const text = el.querySelector('.toast-text');
  const announcer = document.getElementById('announcer');
  const hasPopover = typeof el.showPopover === 'function';
  let timer;
  let queued = null;

  const isOpen = () => (hasPopover ? el.matches(':popover-open') : el.classList.contains('is-open'));
  const hide = () => {
    clearTimeout(timer);
    if (!isOpen()) return;
    if (hasPopover) el.hidePopover();
    else el.classList.remove('is-open');
  };
  const scheduleHide = () => {
    clearTimeout(timer);
    // On ne retire pas une notification pendant que le focus clavier s'y trouve.
    timer = setTimeout(() => (el.contains(document.activeElement) ? scheduleHide() : hide()), TOAST_MS);
  };
  const announce = (message) => {
    if (typeof document.ariaNotify === 'function') {
      document.ariaNotify(message);
      return;
    }
    announcer.textContent = '';
    setTimeout(() => { announcer.textContent = message; }, ANNOUNCE_DELAY_MS);
  };
  const show = ({ message, tone }) => {
    text.textContent = message;
    el.classList.toggle('error', tone === 'error');
    if (!isOpen()) {
      if (hasPopover) el.showPopover();
      else el.classList.add('is-open');
    }
    announce(message);
    if (tone === 'error') clearTimeout(timer); // une erreur reste jusqu'à ce qu'on la ferme
    else scheduleHide();
  };

  if (!hasPopover) el.querySelector('button').addEventListener('click', hide);
  // Pas de notification derrière une fenêtre ouverte : elle attend la fermeture.
  dialog.addEventListener('close', () => {
    if (!queued) return;
    const next = queued;
    queued = null;
    show(next);
  });

  return (message, tone = 'info') => {
    if (dialog.open) queued = { message, tone };
    else show({ message, tone });
  };
}

export function createUi() {
  const dialog = document.getElementById('modal');
  setupDismiss(dialog);
  const toast = createToaster(dialog);

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
   * Ouvre un formulaire. onSubmit(formData, form) lève une Error pour refuser la saisie :
   * le message s'affiche dans la fenêtre, à côté des champs.
   * @param {{title:string, html:string, submitLabel?:string, onSubmit:Function, onDelete?:Function, onMount?:Function}} opts
   */
  function openForm({ title, html, submitLabel = 'Enregistrer', onSubmit, onDelete, onMount }) {
    dialog.removeAttribute('data-closing');
    dialog.innerHTML = `
      <form class="modal-form">
        <header class="modal-head">
          <h2 id="modal-title">${escapeHtml(title)}</h2>
          <button type="button" class="icon-btn" data-close aria-label="Fermer">×</button>
        </header>
        <div class="modal-content">
          <p class="form-error" role="alert"></p>
          ${html}
        </div>
        <footer class="modal-foot">
          ${onDelete ? '<button type="button" class="btn btn-danger" data-delete>Supprimer</button>' : ''}
          <span class="spacer"></span>
          <button type="button" class="btn" data-close>Annuler</button>
          <button type="submit" class="btn btn-primary">${escapeHtml(submitLabel)}</button>
        </footer>
      </form>`;
    const form = dialog.querySelector('form');
    const errorBox = form.querySelector('.form-error');
    const attempt = (action) => {
      try {
        action();
        errorBox.textContent = '';
        closeDialog(dialog);
      } catch (err) {
        errorBox.textContent = err instanceof Error ? err.message : 'Une erreur inattendue est survenue.';
      }
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      attempt(() => onSubmit(new FormData(form), form));
    });
    dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeDialog(dialog)));
    dialog.querySelector('[data-delete]')?.addEventListener('click', () => {
      if (!window.confirm('Supprimer définitivement cet élément ?')) return;
      attempt(() => { onDelete(); toast('Élément supprimé'); });
    });
    initFields(form);
    onMount?.(form);
    if (!dialog.open) dialog.showModal();
    form.querySelector('input:not([type=hidden]):not([type=checkbox]), select, textarea')?.focus();
  }

  return { toast, run, openForm, reportError };
}

/** Texte nettoyé d'un champ de formulaire. */
export const field = (fd, name) => String(fd.get(name) ?? '').trim();

/** Options <select> à partir d'un objet {clé: {label}} / {clé: libellé}, ou d'une liste ordonnée [[clé, libellé]]. */
export function optionsHtml(entries, selected) {
  return (Array.isArray(entries) ? entries : Object.entries(entries))
    .map(([value, v]) => {
      const label = typeof v === 'string' ? v : v.label;
      return `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .join('');
}

/** Champ texte obligatoire avec message d'erreur relié (affiché seulement après la saisie). */
export function requiredFieldHtml({ id, name, label, value = '', placeholder = '', maxlength = 200, type = 'text', required = true, error }) {
  return `<div class="field">
      <label for="${id}">${escapeHtml(label)}</label>
      <input id="${id}" name="${name}" type="${type}"${required ? ' required' : ''} maxlength="${maxlength}" value="${escapeHtml(value)}"
        placeholder="${escapeHtml(placeholder)}" data-error="${id}-error">
      <span id="${id}-error" class="error-msg">Erreur : ${escapeHtml(error)}</span>
    </div>`;
}
