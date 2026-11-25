// Planification d'objectifs : spirituels, professionnels, intellectuels, financiers…

import { DEFAULT_GOAL_REMINDER, GOAL_CATEGORIES, GOAL_REMINDER_OPTIONS } from './constants.js';
import { askForNotifications } from './reminders.js';
import { field, optionsHtml, requiredFieldHtml } from './ui.js';
import { GOAL_REMINDER_TIME, daysUntil, escapeHtml, formatDate, goalProgress, parseLocal, uid } from './utils.js';

const view = { category: 'all' };
const numberFr = (n) => new Intl.NumberFormat('fr-FR').format(n);
const categoryOf = (g) => GOAL_CATEGORIES[g.category] ?? GOAL_CATEGORIES.personnel;
const isDone = (g) => goalProgress(g) >= 1;
const daysLeft = (g) => (g.deadline && parseLocal(g.deadline) ? daysUntil(parseLocal(g.deadline), new Date()) : null);

function compareGoals(a, b) {
  if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
  const da = daysLeft(a) ?? Infinity;
  const db = daysLeft(b) ?? Infinity;
  return da - db || String(a.title).localeCompare(String(b.title), 'fr');
}

function deadlineHtml(g) {
  const n = daysLeft(g);
  if (n === null) return '';
  const date = formatDate(parseLocal(g.deadline), { day: 'numeric', month: 'short', year: 'numeric' });
  if (isDone(g)) return `<span class="muted">Échéance ${date}</span>`;
  if (n < 0) return `<span class="overdue">Échéance ${date} · en retard de ${-n} j</span>`;
  return `<span class="muted">Échéance ${date} · ${n === 0 ? 'aujourd’hui' : `dans ${n} j`}</span>`;
}

function stepsHtml(g) {
  const steps = g.steps ?? [];
  if (!steps.length) return '';
  return `<ul class="steps">${steps.map((s) => `<li><label>
    <input type="checkbox" data-goal="${escapeHtml(g.id)}" data-step="${escapeHtml(s.id)}"${s.done ? ' checked' : ''}>
    <span class="${s.done ? 'done' : ''}">${escapeHtml(s.text)}</span></label></li>`).join('')}</ul>`;
}

function cardHtml(g) {
  const cat = categoryOf(g);
  const pct = Math.round(goalProgress(g) * 100);
  const measure = Number(g.target) > 0
    ? `<p class="measure">${numberFr(Number(g.current) || 0)} / ${numberFr(Number(g.target))} ${escapeHtml(g.unit)}</p>` : '';
  const toggle = g.achieved
    ? `<button type="button" class="btn" data-reopen="${escapeHtml(g.id)}">Rouvrir</button>`
    : (!isDone(g) ? `<button type="button" class="btn" data-achieve="${escapeHtml(g.id)}">Marquer atteint</button>` : '');
  return `<article class="goal-card${isDone(g) ? ' achieved' : ''}" style="--c:${cat.color}">
    <div class="goal-top"><span class="badge">${cat.label}</span>${deadlineHtml(g)}</div>
    <h3>${escapeHtml(g.title)}</h3>
    ${g.description ? `<p class="goal-desc">${escapeHtml(g.description)}</p>` : ''}
    <div class="progress-row">
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progression"><span style="width:${pct}%"></span></div>
      <strong>${isDone(g) ? 'Atteint' : `${pct} %`}</strong>
    </div>
    ${measure}${stepsHtml(g)}
    <footer class="goal-actions"><button type="button" class="btn" data-edit="${escapeHtml(g.id)}">Modifier</button>${toggle}</footer>
  </article>`;
}

const stepRowHtml = (s = { id: '', text: '' }) => `<div class="step-row">
  <input name="stepText" data-id="${escapeHtml(s.id)}" value="${escapeHtml(s.text)}" maxlength="300" placeholder="Étape à franchir…" aria-label="Étape">
  <button type="button" class="icon-btn" data-remove-step aria-label="Retirer l’étape">×</button></div>`;

function goalFormHtml(g) {
  const num = (name, label) => `<label class="field"><span>${label}</span>
    <input type="number" name="${name}" min="0" step="any" inputmode="decimal" value="${escapeHtml(g?.[name])}"></label>`;
  const category = g?.category ?? (view.category !== 'all' ? view.category : 'professionnel');
  return `
    ${requiredFieldHtml({ id: 'goal-title', name: 'title', label: 'Objectif', value: g?.title, placeholder: 'Ex. Lire toute la Bible en un an', error: 'donnez un intitulé à l’objectif.' })}
    <div class="row">
      <label class="field"><span>Catégorie</span><select name="category">${optionsHtml(GOAL_CATEGORIES, category)}</select></label>
      <label class="field"><span>Échéance</span><input type="date" name="deadline" value="${escapeHtml(g?.deadline)}"></label>
    </div>
    <div class="field">
      <label for="goal-reminder">Rappel d’échéance</label>
      <select id="goal-reminder" name="reminder" aria-describedby="goal-reminder-hint">${optionsHtml(GOAL_REMINDER_OPTIONS, g ? String(g.reminder ?? '') : DEFAULT_GOAL_REMINDER)}</select>
      <span id="goal-reminder-hint" class="muted">Notification à ${Number.parseInt(GOAL_REMINDER_TIME, 10)} h, seulement si une échéance est fixée et tant que l’objectif n’est pas atteint.</span>
    </div>
    <label class="field"><span>Pourquoi / description</span><textarea name="description" maxlength="5000">${escapeHtml(g?.description)}</textarea></label>
    <fieldset class="fieldset"><legend>Mesure chiffrée (facultatif)</legend>
      <div class="row three">${num('current', 'Actuel')}${num('target', 'Cible')}
        <label class="field"><span>Unité</span><input name="unit" maxlength="30" value="${escapeHtml(g?.unit)}" placeholder="FCFA, livres, km…"></label></div>
    </fieldset>
    <fieldset class="fieldset"><legend>Étapes</legend>
      <div class="steps-editor">${(g?.steps ?? []).map(stepRowHtml).join('')}</div>
      <button type="button" class="btn" data-add-step>+ Ajouter une étape</button>
    </fieldset>`;
}

function readNumber(fd, name) {
  const raw = field(fd, name);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error('Les valeurs chiffrées doivent être des nombres positifs.');
  return n;
}

function readGoal(fd, form, previous) {
  const title = field(fd, 'title');
  if (!title) throw new Error('Donnez un intitulé à l’objectif.');
  const category = field(fd, 'category');
  if (!GOAL_CATEGORIES[category]) throw new Error('Catégorie inconnue.');
  const doneById = new Map((previous?.steps ?? []).map((s) => [s.id, s.done]));
  const steps = [...form.querySelectorAll('input[name=stepText]')]
    .filter((input) => input.value.trim())
    .map((input) => {
      const id = input.dataset.id || uid();
      return { id, text: input.value.trim(), done: doneById.get(id) ?? false };
    });
  const reminder = field(fd, 'reminder');
  if (!GOAL_REMINDER_OPTIONS.some(([value]) => value === reminder)) throw new Error('Rappel invalide.');
  return {
    title, category, steps, reminder, description: field(fd, 'description'), deadline: field(fd, 'deadline'),
    current: readNumber(fd, 'current'), target: readNumber(fd, 'target'), unit: field(fd, 'unit'),
  };
}

function openGoalForm(ctx, goal) {
  ctx.ui.openForm({
    title: goal ? 'Modifier l’objectif' : 'Nouvel objectif',
    html: goalFormHtml(goal),
    onSubmit(fd, form) {
      const data = readGoal(fd, form, goal);
      ctx.store.upsert('goals', { ...(goal ?? { achieved: false }), ...data });
      ctx.ui.toast(goal ? 'Objectif modifié' : 'Objectif créé');
      if (data.reminder !== '' && data.deadline) askForNotifications(ctx);
    },
    onDelete: goal ? () => ctx.store.remove('goals', goal.id) : null,
    onMount(form) {
      const editor = form.querySelector('.steps-editor');
      form.addEventListener('click', (e) => {
        if (e.target.closest('[data-add-step]')) {
          editor.insertAdjacentHTML('beforeend', stepRowHtml());
          editor.lastElementChild.querySelector('input').focus();
        }
        e.target.closest('[data-remove-step]')?.closest('.step-row').remove();
      });
    },
  });
}

function toggleStep(ctx, input) {
  const goal = ctx.store.getState().goals.find((g) => g.id === input.dataset.goal);
  if (!goal) return;
  const updated = { ...goal, steps: goal.steps.map((s) => (s.id === input.dataset.step ? { ...s, done: input.checked } : s)) };
  ctx.ui.run(() => ctx.store.upsert('goals', updated), !isDone(goal) && isDone(updated) ? 'Bravo, objectif atteint !' : '');
}

function handleClick(e, root, ctx) {
  const t = e.target.closest('button');
  if (!t) return;
  const find = (id) => ctx.store.getState().goals.find((g) => g.id === id);
  const { act, category, edit, achieve, reopen } = t.dataset;
  if (act === 'new') openGoalForm(ctx, null);
  else if (category) { view.category = category; renderGoals(root, ctx); }
  else if (edit) openGoalForm(ctx, find(edit));
  else if (achieve) ctx.ui.run(() => ctx.store.upsert('goals', { ...find(achieve), achieved: true }), 'Bravo, objectif atteint !');
  else if (reopen) ctx.ui.run(() => ctx.store.upsert('goals', { ...find(reopen), achieved: false }));
}

function summaryHtml(goals) {
  const active = goals.filter((g) => !isDone(g));
  const late = active.filter((g) => (daysLeft(g) ?? 0) < 0).length;
  const stat = (n, label, cls = '') => `<div class="stat ${cls}"><strong>${n}</strong><span class="muted">${label}</span></div>`;
  return `<div class="stats">${stat(active.length, 'en cours')}${stat(goals.length - active.length, 'atteints')}${stat(late, 'en retard', late ? 'overdue' : '')}</div>`;
}

export function renderGoals(root, ctx) {
  const { goals } = ctx.store.getState();
  const count = (key) => goals.filter((g) => g.category === key).length;
  const tab = (key, label, n) => `<button type="button" class="filter" data-category="${key}" aria-pressed="${view.category === key}">${label}<span class="count">${n}</span></button>`;
  const shown = goals.filter((g) => view.category === 'all' || g.category === view.category).sort(compareGoals);
  root.innerHTML = `
    <header class="toolbar"><h1 class="page-title">Objectifs</h1>
      <button type="button" class="btn btn-primary" data-act="new">+ Objectif</button></header>
    ${summaryHtml(goals)}
    <div class="filters" role="group" aria-label="Filtrer par catégorie">${tab('all', 'Tous', goals.length)}${Object.entries(GOAL_CATEGORIES).map(([k, c]) => tab(k, c.label, count(k))).join('')}</div>
    ${shown.length ? `<div class="goals">${shown.map(cardHtml).join('')}</div>`
    : '<div class="empty">Aucun objectif ici pour l’instant.<br>Fixez un cap : spirituel, professionnel, intellectuel, financier…</div>'}`;
  root.onclick = (e) => handleClick(e, root, ctx);
  root.onchange = (e) => { if (e.target.matches('input[data-step]')) toggleStep(ctx, e.target); };
}
