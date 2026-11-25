// Agenda : vues Mois, Semaine, Jour et Liste.

import { EVENT_TYPES, GOAL_CATEGORIES } from './constants.js';
import { openEventForm } from './event-form.js';
import { participantNames } from './people.js';
import {
  DAY_MS, addDays, addMonths, dateKey, endOfDay, escapeHtml, formatDate, layoutColumns, minutesBetween,
  monthGridStart, occurrencesInRange, pad, parseLocal, sameDay, startOfDay, startOfWeek, timeKey,
} from './utils.js';

const HOUR_PX = 48;
const MIN_BLOCK_MINUTES = 30;
const MIN_BLOCK_PX = 20;
const SCROLL_TO_HOUR = 7;
const DEFAULT_HOUR = 9;
const AGENDA_DAYS = 30;
const MAX_CHIPS = 3;
const VIEWS = { month: 'Mois', week: 'Semaine', day: 'Jour', agenda: 'Liste' };
const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

const view = {
  mode: window.matchMedia('(max-width: 760px)').matches ? 'agenda' : 'month',
  cursor: startOfDay(new Date()),
};

function viewRange(mode, cursor) {
  if (mode === 'month') { const s = monthGridStart(cursor); return [s, addDays(s, 42)]; }
  if (mode === 'week') { const s = startOfWeek(cursor); return [s, addDays(s, 7)]; }
  if (mode === 'day') return [cursor, addDays(cursor, 1)];
  return [cursor, addDays(cursor, AGENDA_DAYS)];
}

function shift(mode, cursor, dir) {
  if (mode === 'month') return addMonths(new Date(cursor.getFullYear(), cursor.getMonth(), 1), dir);
  if (mode === 'week') return addDays(cursor, 7 * dir);
  if (mode === 'day') return addDays(cursor, dir);
  return addDays(cursor, AGENDA_DAYS * dir);
}

function viewTitle(mode, cursor) {
  if (mode === 'month') return formatDate(cursor, { month: 'long', year: 'numeric' });
  if (mode === 'day') return formatDate(cursor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const [s, e] = viewRange(mode, cursor);
  return `${formatDate(s, { day: 'numeric', month: 'short' })} – ${formatDate(addDays(e, -1), { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** Événements (récurrences dépliées) + échéances d'objectifs sur la plage. */
function collectItems(state, start, end) {
  const events = state.events.flatMap((ev) => occurrencesInRange(ev, start, end).map((o) => ({
    ...o, kind: 'event', color: (EVENT_TYPES[ev.type] ?? EVENT_TYPES.autre).color,
    people: participantNames(ev.contactIds, state.contacts),
  })));
  const deadlines = state.goals
    .filter((g) => g.deadline && !g.achieved && parseLocal(g.deadline))
    .map((g) => {
      const day = parseLocal(g.deadline);
      const color = (GOAL_CATEGORIES[g.category] ?? GOAL_CATEGORIES.personnel).color;
      return { kind: 'goal', id: g.id, key: `goal:${g.id}`, title: `Objectif : ${g.title}`, start: day, end: endOfDay(day), allDay: true, color };
    })
    .filter((g) => g.start < end && g.end >= start);
  return [...events, ...deadlines].sort((a, b) => a.start - b.start);
}

const isAllDay = (it) => it.allDay || it.end - it.start >= DAY_MS - 60_000;
const itemsOnDay = (items, day) => {
  const next = addDays(day, 1);
  return items.filter((it) => it.start < next && (it.end > day || +it.start === +day));
};
const itemAttrs = (it) => `data-kind="${it.kind}" data-id="${escapeHtml(it.id)}" style="--c:${it.color}"`;

const withPeople = (it) => (it.people?.length ? `${it.title} — avec ${it.people.join(', ')}` : it.title);
const peopleHtml = (it) => (it.people?.length ? `<span class="muted agenda-people">Avec ${escapeHtml(it.people.join(', '))}</span>` : '');

function chipHtml(it) {
  const time = isAllDay(it) ? '' : `<b>${timeKey(it.start)}</b> `;
  return `<button type="button" class="chip${isAllDay(it) ? ' solid' : ''}" ${itemAttrs(it)} title="${escapeHtml(withPeople(it))}">${time}${escapeHtml(it.title)}</button>`;
}

function monthHtml(items, cursor) {
  const start = monthGridStart(cursor);
  const today = new Date();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const day = addDays(start, i);
    const list = itemsOnDay(items, day);
    const extra = list.length - MAX_CHIPS;
    const classes = `month-cell${day.getMonth() !== cursor.getMonth() ? ' outside' : ''}${sameDay(day, today) ? ' today' : ''}`;
    return `<div class="${classes}" data-date="${dateKey(day)}">
      <button type="button" class="day-num" data-goto="${dateKey(day)}" aria-label="${formatDate(day, { dateStyle: 'full' })}">${day.getDate()}</button>
      ${list.slice(0, MAX_CHIPS).map(chipHtml).join('')}
      ${extra > 0 ? `<button type="button" class="more" data-goto="${dateKey(day)}">+${extra} de plus</button>` : ''}
    </div>`;
  }).join('');
  return `<div class="month"><div class="month-head">${WEEKDAYS.map((d) => `<div>${d}</div>`).join('')}</div>
    <div class="month-grid">${cells}</div></div>`;
}

const toPx = (minutes) => (minutes * HOUR_PX) / 60;

function timedBlocksHtml(items, day) {
  const dayEnd = addDays(day, 1);
  const blocks = itemsOnDay(items, day).filter((it) => !isAllDay(it)).map((it) => {
    const start = new Date(Math.max(it.start, day));
    const end = new Date(Math.min(Math.max(it.end, +start + MIN_BLOCK_MINUTES * 60_000), dayEnd));
    return { ...it, start, end, realStart: it.start, realEnd: it.end };
  });
  return layoutColumns(blocks).map((b) => {
    const top = toPx(minutesBetween(day, b.start));
    const height = Math.max(toPx(minutesBetween(b.start, b.end)), MIN_BLOCK_PX);
    return `<button type="button" class="tg-event" data-kind="${b.kind}" data-id="${escapeHtml(b.id)}"
      style="--c:${b.color};--col:${b.col};--cols:${b.cols};top:${top}px;height:${height}px">
      <strong>${escapeHtml(b.title)}</strong><span>${timeKey(b.realStart)} – ${timeKey(b.realEnd)}</span></button>`;
  }).join('');
}

function timeGridHtml(items, days) {
  const now = new Date();
  const head = days.map((d) => `<button type="button" class="tg-dayhead${sameDay(d, now) ? ' today' : ''}" data-goto="${dateKey(d)}">
    <span>${formatDate(d, { weekday: 'short' })}</span><strong>${d.getDate()}</strong></button>`).join('');
  const allDay = days.map((d) => `<div class="tg-allday-cell">${itemsOnDay(items, d).filter(isAllDay).map(chipHtml).join('')}</div>`).join('');
  const hours = Array.from({ length: 24 }, (_, h) => `<div>${pad(h)}:00</div>`).join('');
  const nowLine = `<div class="now-line" style="top:${toPx(minutesBetween(startOfDay(now), now))}px"></div>`;
  const cols = days.map((d) => `<div class="tg-col" data-date="${dateKey(d)}">${timedBlocksHtml(items, d)}${sameDay(d, now) ? nowLine : ''}</div>`).join('');
  return `<div class="tg" style="--days:${days.length};--hour:${HOUR_PX}px">
    <div class="tg-head"><div class="tg-gutter"></div>${head}</div>
    <div class="tg-allday"><div class="tg-gutter">Journée</div>${allDay}</div>
    <div class="tg-scroll"><div class="tg-grid"><div class="tg-hours">${hours}</div>${cols}</div></div>
  </div>`;
}

function agendaHtml(items, start) {
  const today = new Date();
  const sections = Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(start, i)).map((day) => {
    const list = itemsOnDay(items, day);
    if (!list.length) return '';
    const rows = list.map((it) => `<li><button type="button" class="agenda-item" ${itemAttrs(it)}>
      <span class="dot"></span>
      <span class="agenda-time">${isAllDay(it) ? 'Journée' : `${timeKey(it.start)} – ${timeKey(it.end)}`}</span>
      <span class="agenda-title">${escapeHtml(it.title)}${it.location ? `<span class="muted">${escapeHtml(it.location)}</span>` : ''}${peopleHtml(it)}</span>
    </button></li>`).join('');
    return `<section class="agenda-day${sameDay(day, today) ? ' is-today' : ''}">
      <h2>${formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}</h2><ul class="agenda-list">${rows}</ul></section>`;
  }).join('');
  return `<div class="agenda">${sections || `<div class="empty">Rien de prévu sur les ${AGENDA_DAYS} prochains jours.<br>Appuyez sur « Créer » pour ajouter une réunion, un rendez-vous ou une activité.</div>`}</div>`;
}

function bodyHtml(items, start) {
  if (view.mode === 'month') return monthHtml(items, view.cursor);
  if (view.mode === 'agenda') return agendaHtml(items, start);
  const count = view.mode === 'week' ? 7 : 1;
  return timeGridHtml(items, Array.from({ length: count }, (_, i) => addDays(start, i)));
}

function defaultStart(day) {
  const now = new Date();
  if (sameDay(day, now)) return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), DEFAULT_HOUR);
}

function toolbarHtml() {
  const tabs = Object.entries(VIEWS).map(([k, label]) => `<button type="button" data-view="${k}" aria-pressed="${k === view.mode}">${label}</button>`).join('');
  const legend = Object.values(EVENT_TYPES).map((t) => `<span class="legend-item" style="--c:${t.color}"><span class="dot"></span>${t.label}</span>`).join('');
  return `<header class="toolbar">
      <div class="toolbar-group">
        <button type="button" class="btn" data-act="today">Aujourd’hui</button>
        <button type="button" class="icon-btn" data-act="prev" aria-label="Période précédente">‹</button>
        <button type="button" class="icon-btn" data-act="next" aria-label="Période suivante">›</button>
        <h1 class="page-title cal-title">${viewTitle(view.mode, view.cursor)}</h1>
      </div>
      <div class="toolbar-group">
        <div class="segmented" role="group" aria-label="Affichage">${tabs}</div>
        <button type="button" class="btn btn-primary" data-act="new">+ Créer</button>
      </div>
    </header>
    <div class="legend">${legend}</div>`;
}

function handleClick(e, root, ctx) {
  const target = e.target.closest('button, .month-cell, .tg-col');
  if (!target) return;
  const rerender = () => renderCalendar(root, ctx);
  const { act, goto, kind, id, date } = target.dataset;
  if (act === 'today') { view.cursor = startOfDay(new Date()); return rerender(); }
  if (act === 'prev' || act === 'next') { view.cursor = shift(view.mode, view.cursor, act === 'prev' ? -1 : 1); return rerender(); }
  if (act === 'new') return openEventForm(ctx, null, defaultStart(view.cursor));
  if (target.dataset.view) { view.mode = target.dataset.view; return rerender(); }
  if (kind === 'goal') { window.location.hash = '#/objectifs'; return undefined; }
  if (kind === 'event') {
    const ev = ctx.store.getState().events.find((x) => x.id === id);
    return ev && openEventForm(ctx, ev);
  }
  if (goto) { view.cursor = parseLocal(goto); view.mode = 'day'; return rerender(); }
  if (target.classList.contains('month-cell')) return openEventForm(ctx, null, defaultStart(parseLocal(date)));
  if (target.classList.contains('tg-col')) {
    const offset = e.clientY - target.getBoundingClientRect().top;
    const halfHours = Math.max(0, Math.min(47, Math.floor(offset / (HOUR_PX / 2))));
    const day = parseLocal(date);
    return openEventForm(ctx, null, new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, halfHours * 30));
  }
  return undefined;
}

export function renderCalendar(root, ctx) {
  const [start, end] = viewRange(view.mode, view.cursor);
  const items = collectItems(ctx.store.getState(), start, end);
  root.innerHTML = `${toolbarHtml()}<section class="cal-body">${bodyHtml(items, start)}</section>`;
  root.onclick = (e) => handleClick(e, root, ctx);
  const scroller = root.querySelector('.tg-scroll');
  if (!scroller) return;
  scroller.scrollTop = SCROLL_TO_HOUR * HOUR_PX;
  // Aligne les en-têtes de jours sur la grille malgré la barre de défilement.
  const scrollbar = scroller.offsetWidth - scroller.clientWidth;
  root.querySelectorAll('.tg-head, .tg-allday').forEach((el) => { el.style.paddingRight = `${scrollbar}px`; });
}
