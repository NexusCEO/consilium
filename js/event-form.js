// Formulaire de création / modification d'un événement.

import { EVENT_TYPES, REPEAT_OPTIONS } from './constants.js';
import { field, optionsHtml } from './ui.js';
import { dateKey, escapeHtml, parseLocal, timeKey } from './utils.js';

const HOUR_MS = 3_600_000;

function formHtml(ev, start, end) {
  const allDay = Boolean(ev?.allDay);
  const recurring = ev?.repeat && ev.repeat !== 'none';
  return `
    <label class="field"><span>Titre</span>
      <input name="title" required maxlength="200" value="${escapeHtml(ev?.title)}" placeholder="Ex. Réunion de chantier"></label>
    <div class="row">
      <label class="field"><span>Type</span><select name="type">${optionsHtml(EVENT_TYPES, ev?.type ?? 'reunion')}</select></label>
      <label class="check"><input type="checkbox" name="allDay"${allDay ? ' checked' : ''}> Toute la journée</label>
    </div>
    <div class="row">
      <label class="field"><span>Début</span><input type="date" name="startDate" required value="${dateKey(start)}"></label>
      <label class="field time-field"><span>Heure de début</span><input type="time" name="startTime" value="${timeKey(start)}"></label>
    </div>
    <div class="row">
      <label class="field"><span>Fin</span><input type="date" name="endDate" required value="${dateKey(end)}"></label>
      <label class="field time-field"><span>Heure de fin</span><input type="time" name="endTime" value="${timeKey(end)}"></label>
    </div>
    <div class="row">
      <label class="field"><span>Répétition</span><select name="repeat">${optionsHtml(REPEAT_OPTIONS, ev?.repeat ?? 'none')}</select></label>
      <label class="field"><span>Jusqu’au (facultatif)</span><input type="date" name="repeatUntil" value="${escapeHtml(ev?.repeatUntil)}"></label>
    </div>
    <label class="field"><span>Lieu</span><input name="location" maxlength="200" value="${escapeHtml(ev?.location)}" placeholder="Adresse, salle, lien visio…"></label>
    <label class="field"><span>Notes</span><textarea name="notes" maxlength="5000">${escapeHtml(ev?.notes)}</textarea></label>
    ${recurring ? '<p class="muted">Événement récurrent : les modifications s’appliquent à toute la série.</p>' : ''}`;
}

function readEvent(fd) {
  const title = field(fd, 'title');
  if (!title) throw new Error('Le titre est obligatoire.');
  const type = field(fd, 'type');
  const repeat = field(fd, 'repeat');
  if (!EVENT_TYPES[type] || !REPEAT_OPTIONS[repeat]) throw new Error('Type ou répétition invalide.');
  const allDay = fd.get('allDay') === 'on';
  const startDate = field(fd, 'startDate');
  const endDate = field(fd, 'endDate') || startDate;
  const start = allDay ? `${startDate}T00:00` : `${startDate}T${field(fd, 'startTime') || '00:00'}`;
  const end = allDay ? `${endDate}T23:59` : `${endDate}T${field(fd, 'endTime') || '00:00'}`;
  if (!parseLocal(start) || !parseLocal(end)) throw new Error('Date ou heure invalide.');
  if (parseLocal(end) < parseLocal(start)) throw new Error('La fin doit être après le début.');
  const repeatUntil = repeat === 'none' ? '' : field(fd, 'repeatUntil');
  return { title, type, allDay, start, end, repeat, repeatUntil, location: field(fd, 'location'), notes: field(fd, 'notes') };
}

function syncTimeFields(form) {
  const allDay = form.elements.allDay.checked;
  form.querySelectorAll('.time-field').forEach((el) => { el.hidden = allDay; });
}

/** @param ev événement existant, ou null pour une création à `defaultStart`. */
export function openEventForm(ctx, ev, defaultStart) {
  const start = ev ? parseLocal(ev.start) : defaultStart;
  const end = ev ? parseLocal(ev.end) : new Date(+defaultStart + HOUR_MS);
  ctx.ui.openForm({
    title: ev ? 'Modifier l’événement' : 'Nouvel événement',
    html: formHtml(ev, start, end),
    onSubmit(fd) {
      ctx.store.upsert('events', { ...(ev ?? {}), ...readEvent(fd) });
      ctx.ui.toast(ev ? 'Événement modifié' : 'Événement créé');
    },
    onDelete: ev ? () => ctx.store.remove('events', ev.id) : null,
    onMount(form) {
      syncTimeFields(form);
      form.elements.allDay.addEventListener('change', () => syncTimeFields(form));
      form.elements.startDate.addEventListener('change', () => {
        if (form.elements.endDate.value < form.elements.startDate.value) form.elements.endDate.value = form.elements.startDate.value;
      });
    },
  });
}
