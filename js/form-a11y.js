// Accessibilité des erreurs de saisie : aria-invalid suit l'état visuel :user-invalid,
// le message d'erreur n'est relié au champ (aria-describedby) que lorsqu'il est affiché,
// et une erreur qui apparaît en quittant un champ est annoncée une fois, poliment.

const ANNOUNCE_AFTER_MS = 500;
const flagged = new WeakSet();
const announced = new WeakSet();
let announceTimer;
let announcedField;

const announcer = () => document.getElementById('announcer');

function linkError(el, shown) {
  const errorId = el.dataset.error;
  if (!errorId) return;
  const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter((id) => id && id !== errorId);
  if (shown) ids.push(errorId);
  if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
  else el.removeAttribute('aria-describedby');
}

function announceError(el) {
  const error = document.getElementById(el.dataset.error);
  const region = announcer();
  if (!error || !region) return;
  const label = el.labels?.[0] ? `${el.labels[0].textContent.trim()} : ` : '';
  clearTimeout(announceTimer);
  region.textContent = '';
  announcedField = el;
  // Laisse d'abord le lecteur d'écran annoncer le champ suivant.
  announceTimer = setTimeout(() => { region.textContent = label + error.textContent.replace(/\s+/g, ' ').trim(); }, ANNOUNCE_AFTER_MS);
}

function syncAria(el, announce = false) {
  if (!el.matches?.('input, select, textarea')) return;
  if (el.matches(':user-invalid')) {
    if (announce && !announced.has(el)) {
      announceError(el);
      announced.add(el);
    }
    el.setAttribute('aria-invalid', 'true');
    linkError(el, true);
    flagged.add(el);
  } else if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
    el.setAttribute('aria-invalid', 'false');
    linkError(el, false);
    flagged.delete(el);
    announced.delete(el);
    if (announcedField === el) {
      clearTimeout(announceTimer);
      const region = announcer();
      if (region) region.textContent = '';
    }
  }
}

/** Met chaque champ d'un formulaire nouvellement affiché à aria-invalid="false". */
export function initFields(root) {
  root.querySelectorAll('input, select, textarea').forEach((el) => syncAria(el));
}

/** À appeler une fois : écoute les interactions sur tout le document. */
export function startFormAccessibility() {
  document.addEventListener('blur', (e) => syncAria(e.target, true), true);
  document.addEventListener('input', (e) => { if (e.target.hasAttribute?.('aria-invalid')) syncAria(e.target); });
  document.addEventListener('change', (e) => syncAria(e.target, true), true);
  // Envoi refusé : le navigateur place le focus sur le 1er champ invalide, qui annonce son erreur.
  document.addEventListener('invalid', (e) => {
    announced.add(e.target);
    syncAria(e.target);
  }, true);
}
