// Export vers les calendriers du téléphone : fichier iCalendar (.ics, RFC 5545) et lien Google Agenda.
// Les heures sont « flottantes » (heure locale de l'appareil), comme dans Consilium.

import { addDays, pad, parseLocal } from './utils.js';

const MAX_LINE_OCTETS = 75;
const FREQ = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' };
const encoder = new TextEncoder();

const icsDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const icsDateTime = (d) => `${icsDate(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const icsUtc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escapeText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Plie une ligne en morceaux de 75 octets maximum (les suites commencent par une espace). */
function fold(line) {
  const parts = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    const limit = parts.length ? MAX_LINE_OCTETS - 1 : MAX_LINE_OCTETS;
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** Règle de répétition, ou null. */
export function recurrenceRule(event) {
  const freq = FREQ[event.repeat];
  if (!freq) return null;
  const until = parseLocal(event.repeatUntil);
  return `FREQ=${freq}${until ? `;UNTIL=${icsDate(until)}T235959` : ''}`;
}

function eventLines(event, now) {
  const start = parseLocal(event.start);
  const end = parseLocal(event.end);
  if (!start || !end) return [];
  const timing = event.allDay
    ? [`DTSTART;VALUE=DATE:${icsDate(start)}`, `DTEND;VALUE=DATE:${icsDate(addDays(end, 1))}`]
    : [`DTSTART:${icsDateTime(start)}`, `DTEND:${icsDateTime(end)}`];
  const rule = recurrenceRule(event);
  const minutes = event.reminder === '' || event.reminder == null ? NaN : Number(event.reminder);
  const alarm = Number.isFinite(minutes) && minutes >= 0
    ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-PT${minutes}M`, `DESCRIPTION:${escapeText(event.title)}`, 'END:VALARM']
    : [];
  return [
    'BEGIN:VEVENT',
    `UID:${event.id}@consilium`,
    `DTSTAMP:${icsUtc(now)}`,
    ...timing,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.notes ? [`DESCRIPTION:${escapeText(event.notes)}`] : []),
    ...(rule ? [`RRULE:${rule}`] : []),
    ...alarm,
    'END:VEVENT',
  ];
}

/** Contenu d'un fichier .ics pour une liste d'événements Consilium. */
export function toIcs(events, now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Consilium//Agenda//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...events.flatMap((e) => eventLines(e, now)),
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Lien qui ouvre Google Agenda avec l'événement prérempli. */
export function googleCalendarUrl(event) {
  const start = parseLocal(event.start);
  const end = parseLocal(event.end);
  const dates = event.allDay
    ? `${icsDate(start)}/${icsDate(addDays(end, 1))}`
    : `${icsDateTime(start)}/${icsDateTime(end)}`;
  const params = new URLSearchParams({ action: 'TEMPLATE', text: event.title ?? '', dates });
  if (event.location) params.set('location', event.location);
  if (event.notes) params.set('details', event.notes);
  const rule = recurrenceRule(event);
  if (rule) params.set('recur', `RRULE:${rule}`);
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** Télécharge un fichier .ics (l'appareil propose ensuite de l'ajouter à son calendrier). */
export function downloadIcs(events, filename) {
  const blob = new Blob([toIcs(events)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
