// Choix des participants d'un rendez-vous parmi les contacts du répertoire :
// cases à cocher groupées (choix multiple) + recherche, sélectionnés en tête.

import { byName, domainOf, fullName, initials } from './people.js';
import { domainColor, escapeHtml, searchable } from './utils.js';

const searchText = (c) => searchable([fullName(c), c.company, c.role, c.domain].join(' '));

function optionHtml(c, checked) {
  const id = `p-${escapeHtml(c.id)}`;
  const detail = [c.role, domainOf(c)].filter(Boolean).join(' · ');
  return `<li data-search="${escapeHtml(searchText(c))}">
      <input type="checkbox" id="${id}" name="contactIds" value="${escapeHtml(c.id)}"${checked ? ' checked' : ''}>
      <label for="${id}">
        <span class="avatar avatar-sm" style="--c:${domainColor(domainOf(c))}" aria-hidden="true">${escapeHtml(initials(c))}</span>
        <span class="participant-text"><span>${escapeHtml(fullName(c))}</span><span class="muted">${escapeHtml(detail)}</span></span>
      </label>
    </li>`;
}

/** HTML du sélecteur. `selectedIds` : contacts déjà liés. */
export function participantsHtml(contacts, selectedIds = []) {
  const selected = new Set(selectedIds);
  const legend = (n) => `Participants <span class="muted">(<span data-count>${n}</span>)</span>`;
  if (!contacts.length) {
    return `<fieldset class="fieldset"><legend>${legend(0)}</legend>
      <p class="muted">Aucun contact dans le répertoire. Ajoutez-en dans l’onglet Contacts pour les lier à vos rendez-vous.</p></fieldset>`;
  }
  const sorted = [...contacts].sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)) || byName(a, b));
  const count = contacts.filter((c) => selected.has(c.id)).length;
  return `<fieldset class="fieldset participants">
      <legend>${legend(count)}</legend>
      <search>
        <label for="participant-filter" class="visually-hidden">Rechercher un contact</label>
        <input type="search" id="participant-filter" placeholder="Rechercher un contact…"
          autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="search">
      </search>
      <ul class="participant-list">${sorted.map((c) => optionHtml(c, selected.has(c.id))).join('')}</ul>
      <p class="muted" data-no-match hidden>Aucun contact ne correspond.</p>
    </fieldset>`;
}

/** Filtre à la saisie (les contacts cochés restent visibles) et compteur à jour. */
export function mountParticipants(form) {
  const box = form.querySelector('.participants');
  if (!box) return;
  const filter = box.querySelector('#participant-filter');
  const items = [...box.querySelectorAll('li')];
  const applyFilter = () => {
    const q = searchable(filter.value.trim());
    let shown = 0;
    items.forEach((li) => {
      const visible = !q || li.dataset.search.includes(q) || li.querySelector('input').checked;
      li.hidden = !visible;
      shown += visible ? 1 : 0;
    });
    box.querySelector('[data-no-match]').hidden = shown > 0;
  };
  filter.addEventListener('input', applyFilter);
  // Entrée dans la recherche ne doit pas enregistrer le rendez-vous (sauf saisie IME en cours).
  filter.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) e.preventDefault(); });
  box.addEventListener('change', () => {
    box.querySelector('[data-count]').textContent = String(box.querySelectorAll('input[name=contactIds]:checked').length);
  });
}

/** Identifiants cochés qui existent toujours dans le répertoire. */
export function readParticipants(fd, contacts) {
  const known = new Set(contacts.map((c) => c.id));
  return [...new Set(fd.getAll('contactIds').map(String))].filter((id) => known.has(id));
}
