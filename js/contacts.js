// Répertoire de contacts rangés par domaine d'activité.

import { field, requiredFieldHtml } from './ui.js';
import { domainColor, escapeHtml, searchable } from './utils.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const view = { domain: 'all', query: '' };

const fullName = (c) => `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.company || 'Sans nom';
const initials = (c) => fullName(c).split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const domainOf = (c) => c.domain || 'Autre';
const searchText = (c) => searchable([c.firstName, c.lastName, c.company, c.role, c.phone, c.email, c.address, c.notes].join(' '));
const byFavoriteThenName = (a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite))
  || fullName(a).localeCompare(fullName(b), 'fr');

function cardHtml(c) {
  const phone = String(c.phone ?? '').replace(/[^\d+]/g, '');
  const subtitle = [c.role, c.company].filter(Boolean).join(' · ');
  return `<article class="contact-card">
    <button type="button" class="contact-main" data-edit="${escapeHtml(c.id)}">
      <span class="avatar" style="--c:${domainColor(domainOf(c))}">${escapeHtml(initials(c))}</span>
      <span class="contact-text">
        <span class="name">${escapeHtml(fullName(c))}</span>
        ${subtitle ? `<span class="muted ellipsis">${escapeHtml(subtitle)}</span>` : ''}
      </span>
    </button>
    <div class="contact-actions">
      ${phone ? `<a class="link-btn" href="tel:${escapeHtml(phone)}">Appeler</a>` : ''}
      ${phone ? `<a class="link-btn" href="sms:${escapeHtml(phone)}">SMS</a>` : ''}
      ${c.email ? `<a class="link-btn" href="mailto:${escapeHtml(encodeURI(c.email))}">E-mail</a>` : ''}
      <button type="button" class="link-btn fav" data-fav="${escapeHtml(c.id)}" aria-pressed="${Boolean(c.favorite)}"
        aria-label="${c.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${c.favorite ? '★ Favori' : '☆'}</button>
    </div>
  </article>`;
}

function listHtml(state) {
  const q = searchable(view.query.trim());
  const filtered = state.contacts
    .filter((c) => (view.domain === 'all' || domainOf(c) === view.domain) && (!q || searchText(c).includes(q)))
    .sort(byFavoriteThenName);
  if (!filtered.length) {
    const msg = state.contacts.length ? 'Aucun contact ne correspond.' : 'Votre répertoire est vide. Ajoutez votre premier contact.';
    return `<div class="empty">${msg}</div>`;
  }
  if (view.domain !== 'all') return `<div class="cards">${filtered.map(cardHtml).join('')}</div>`;
  const order = [...new Set([...state.domains, ...filtered.map(domainOf)])];
  return order.map((d) => {
    const list = filtered.filter((c) => domainOf(c) === d);
    if (!list.length) return '';
    return `<section class="group"><h2><span class="swatch" style="--c:${domainColor(d)}"></span>${escapeHtml(d)}
      <span class="muted">${list.length}</span></h2><div class="cards">${list.map(cardHtml).join('')}</div></section>`;
  }).join('');
}

function filtersHtml(state) {
  const counts = state.contacts.reduce((acc, c) => ({ ...acc, [domainOf(c)]: (acc[domainOf(c)] ?? 0) + 1 }), {});
  const btn = (value, label, count) => `<button type="button" class="filter" data-domain="${escapeHtml(value)}"
    aria-pressed="${view.domain === value}">${escapeHtml(label)}<span class="count">${count}</span></button>`;
  return btn('all', 'Tous', state.contacts.length) + state.domains.map((d) => btn(d, d, counts[d] ?? 0)).join('');
}

function contactFormHtml(c, domains) {
  const selected = c?.domain ?? (view.domain !== 'all' ? view.domain : domains[0]);
  const options = domains.map((d) => `<option${d === selected ? ' selected' : ''}>${escapeHtml(d)}</option>`).join('');
  const input = (name, label, type = 'text', extra = '') => `<label class="field"><span>${label}</span>
    <input type="${type}" name="${name}" value="${escapeHtml(c?.[name])}" maxlength="200" ${extra}></label>`;
  return `
    <div class="row">${input('firstName', 'Prénom', 'text', 'autocomplete="given-name"')}${input('lastName', 'Nom', 'text', 'autocomplete="family-name"')}</div>
    <label class="field"><span>Domaine d’activité</span><select name="domain">${options}</select></label>
    <div class="row">${input('role', 'Fonction / métier', 'text', 'placeholder="Ex. Architecte, Avocat…"')}${input('company', 'Entreprise / structure')}</div>
    <div class="row">${input('phone', 'Téléphone', 'tel', 'autocomplete="tel"')}
      ${requiredFieldHtml({ id: 'contact-email', name: 'email', label: 'E-mail', type: 'email', required: false, value: c?.email, placeholder: 'nom@exemple.com', error: 'adresse e-mail au format nom@exemple.com.' })}</div>
    ${input('address', 'Adresse')}
    <label class="field"><span>Notes</span><textarea name="notes" maxlength="5000">${escapeHtml(c?.notes)}</textarea></label>
    <label class="check"><input type="checkbox" name="favorite"${c?.favorite ? ' checked' : ''}> Favori</label>`;
}

function readContact(fd, domains) {
  const keys = ['firstName', 'lastName', 'role', 'company', 'phone', 'email', 'address', 'notes'];
  const data = Object.fromEntries(keys.map((k) => [k, field(fd, k)]));
  if (!data.firstName && !data.lastName && !data.company) throw new Error('Indiquez au moins un nom ou une entreprise.');
  if (data.email && !EMAIL_PATTERN.test(data.email)) throw new Error('Adresse e-mail invalide.');
  const domain = field(fd, 'domain');
  if (!domains.includes(domain)) throw new Error('Domaine inconnu.');
  return { ...data, domain, favorite: fd.get('favorite') === 'on' };
}

function openContactForm(ctx, contact) {
  const { domains } = ctx.store.getState();
  ctx.ui.openForm({
    title: contact ? 'Modifier le contact' : 'Nouveau contact',
    html: contactFormHtml(contact, domains),
    onSubmit(fd) {
      ctx.store.upsert('contacts', { ...(contact ?? {}), ...readContact(fd, domains) });
      ctx.ui.toast(contact ? 'Contact modifié' : 'Contact ajouté');
    },
    onDelete: contact ? () => ctx.store.remove('contacts', contact.id) : null,
  });
}

function openDomainForm(ctx) {
  ctx.ui.openForm({
    title: 'Nouveau domaine d’activité',
    submitLabel: 'Ajouter',
    html: requiredFieldHtml({ id: 'domain-name', name: 'name', label: 'Nom du domaine', maxlength: 60, placeholder: 'Ex. Agriculture', error: 'donnez un nom au domaine.' }),
    onSubmit(fd) {
      ctx.store.addDomain(fd.get('name'));
      ctx.ui.toast('Domaine ajouté');
    },
  });
}

function handleClick(e, root, ctx) {
  const t = e.target.closest('button');
  if (!t) return;
  const state = ctx.store.getState();
  if (t.dataset.act === 'new') openContactForm(ctx, null);
  else if (t.dataset.act === 'domain') openDomainForm(ctx);
  else if (t.dataset.domain) { view.domain = t.dataset.domain; renderContacts(root, ctx); }
  else if (t.dataset.edit) openContactForm(ctx, state.contacts.find((c) => c.id === t.dataset.edit));
  else if (t.dataset.fav) {
    const c = state.contacts.find((x) => x.id === t.dataset.fav);
    if (c) ctx.ui.run(() => ctx.store.upsert('contacts', { ...c, favorite: !c.favorite }));
  }
}

export function renderContacts(root, ctx) {
  const state = ctx.store.getState();
  if (view.domain !== 'all' && !state.domains.includes(view.domain)) view.domain = 'all';
  root.innerHTML = `
    <header class="toolbar">
      <h1 class="page-title">Contacts</h1>
      <div class="toolbar-group grow">
        <input type="search" class="search" value="${escapeHtml(view.query)}" aria-label="Rechercher un contact"
          placeholder="Rechercher un nom, une entreprise, un métier…">
        <button type="button" class="btn" data-act="domain">+ Domaine</button>
        <button type="button" class="btn btn-primary" data-act="new">+ Contact</button>
      </div>
    </header>
    <div class="filters" role="group" aria-label="Filtrer par domaine">${filtersHtml(state)}</div>
    <div class="contact-results">${listHtml(state)}</div>`;
  const results = root.querySelector('.contact-results');
  root.oninput = (e) => {
    if (!e.target.matches('.search')) return;
    view.query = e.target.value;
    results.innerHTML = listHtml(ctx.store.getState());
  };
  root.onclick = (e) => handleClick(e, root, ctx);
}
