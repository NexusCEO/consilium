import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleCalendarUrl, toIcs } from '../js/ics.js';

const NOW = new Date(Date.UTC(2026, 10, 25, 8, 0, 0));
const unfold = (ics) => ics.replace(/\r\n /g, '');

test('événement avec heure, lieu, rappel et texte échappé', () => {
  const ics = toIcs([{
    id: 'a1', title: 'RDV avocat; dossier, urgent', start: '2026-11-25T10:00', end: '2026-11-25T11:30',
    location: 'Plateau', notes: 'Ligne 1\nLigne 2', reminder: '15',
  }], NOW);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  const text = unfold(ics);
  assert.match(text, /UID:a1@consilium\r\n/);
  assert.match(text, /DTSTAMP:20261125T080000Z\r\n/);
  assert.match(text, /DTSTART:20261125T100000\r\n/);
  assert.match(text, /DTEND:20261125T113000\r\n/);
  assert.match(text, /SUMMARY:RDV avocat\\; dossier\\, urgent\r\n/);
  assert.match(text, /DESCRIPTION:Ligne 1\\nLigne 2\r\n/);
  assert.match(text, /BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\n/);
});

test('journée entière : dates sans heure, fin exclusive le lendemain, sans rappel', () => {
  const text = unfold(toIcs([{ id: 'b', title: 'Séminaire', allDay: true, start: '2026-11-27T00:00', end: '2026-11-28T23:59', reminder: '' }], NOW));
  assert.match(text, /DTSTART;VALUE=DATE:20261127\r\n/);
  assert.match(text, /DTEND;VALUE=DATE:20261129\r\n/);
  assert.doesNotMatch(text, /VALARM/);
});

test('récurrence avec date de fin', () => {
  const text = unfold(toIcs([{ id: 'c', title: 'Culte', start: '2026-11-01T07:00', end: '2026-11-01T08:30', repeat: 'weekly', repeatUntil: '2026-12-27' }], NOW));
  assert.match(text, /RRULE:FREQ=WEEKLY;UNTIL=20261227T235959\r\n/);
});

test('les lignes longues sont pliées à 75 octets maximum', () => {
  const ics = toIcs([{ id: 'd', title: 'é'.repeat(120), start: '2026-11-25T10:00', end: '2026-11-25T11:00' }], NOW);
  const encoder = new TextEncoder();
  for (const line of ics.split('\r\n')) assert.ok(encoder.encode(line).length <= 75, line);
  assert.match(unfold(ics), new RegExp(`SUMMARY:${'é'.repeat(120)}\r\n`));
});

test('lien Google Agenda', () => {
  const url = new URL(googleCalendarUrl({ title: 'RDV', start: '2026-11-25T10:00', end: '2026-11-25T11:00', location: 'Plateau', repeat: 'monthly' }));
  assert.equal(url.origin + url.pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('text'), 'RDV');
  assert.equal(url.searchParams.get('dates'), '20261125T100000/20261125T110000');
  assert.equal(url.searchParams.get('location'), 'Plateau');
  assert.equal(url.searchParams.get('recur'), 'RRULE:FREQ=MONTHLY');
});
