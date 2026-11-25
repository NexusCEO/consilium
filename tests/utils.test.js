import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths, dateKey, goalProgress, layoutColumns, occurrencesInRange, parseLocal, startOfWeek,
} from '../js/utils.js';

const d = (s) => parseLocal(s);

test('parseLocal lit date et date+heure, rejette le reste', () => {
  assert.equal(+d('2026-11-25T09:30'), +new Date(2026, 10, 25, 9, 30));
  assert.equal(+d('2026-11-25'), +new Date(2026, 10, 25));
  assert.equal(d('25/11/2026'), null);
  assert.equal(d(undefined), null);
});

test('addMonths ramène au dernier jour du mois', () => {
  assert.equal(dateKey(addMonths(d('2026-01-31'), 1)), '2026-02-28');
  assert.equal(dateKey(addMonths(d('2026-01-31'), 2)), '2026-03-31');
});

test('startOfWeek renvoie le lundi', () => {
  assert.equal(dateKey(startOfWeek(d('2026-11-29'))), '2026-11-23'); // dimanche → lundi
  assert.equal(dateKey(startOfWeek(d('2026-11-23'))), '2026-11-23');
});

test('événement simple : inclus seulement s’il chevauche la plage', () => {
  const ev = { id: 'a', start: '2026-11-25T09:00', end: '2026-11-25T10:00' };
  assert.equal(occurrencesInRange(ev, d('2026-11-25'), d('2026-11-26')).length, 1);
  assert.equal(occurrencesInRange(ev, d('2026-11-26'), d('2026-11-27')).length, 0);
});

test('récurrence hebdomadaire avec date de fin', () => {
  const ev = { id: 'w', start: '2026-11-02T18:00', end: '2026-11-02T19:00', repeat: 'weekly', repeatUntil: '2026-11-23' };
  const occ = occurrencesInRange(ev, d('2026-11-01'), d('2026-12-31'));
  assert.deepEqual(occ.map((o) => dateKey(o.start)), ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
});

test('récurrence quotidienne ancienne : démarre près de la plage, sans en manquer', () => {
  const ev = { id: 'q', start: '2000-01-01T07:00', end: '2000-01-01T07:30', repeat: 'daily' };
  const occ = occurrencesInRange(ev, d('2026-11-23'), d('2026-11-30'));
  assert.equal(occ.length, 7);
  assert.equal(dateKey(occ[0].start), '2026-11-23');
});

test('récurrence mensuelle le 31', () => {
  const ev = { id: 'm', start: '2026-01-31T10:00', end: '2026-01-31T11:00', repeat: 'monthly' };
  const occ = occurrencesInRange(ev, d('2026-02-01'), d('2026-05-01'));
  assert.deepEqual(occ.map((o) => dateKey(o.start)), ['2026-02-28', '2026-03-31', '2026-04-30']);
});

test('layoutColumns place les chevauchements côte à côte', () => {
  const block = (id, s, e) => ({ id, start: d(`2026-11-25T${s}`), end: d(`2026-11-25T${e}`) });
  const out = layoutColumns([block('a', '09:00', '10:00'), block('b', '09:30', '11:00'), block('c', '12:00', '13:00')]);
  const byId = Object.fromEntries(out.map((o) => [o.id, o]));
  assert.deepEqual([byId.a.col, byId.a.cols], [0, 2]);
  assert.deepEqual([byId.b.col, byId.b.cols], [1, 2]);
  assert.deepEqual([byId.c.col, byId.c.cols], [0, 1]);
});

test('goalProgress : cible chiffrée, puis étapes, puis atteint', () => {
  assert.equal(goalProgress({ target: 1000, current: 250 }), 0.25);
  assert.equal(goalProgress({ target: 100, current: 500 }), 1);
  assert.equal(goalProgress({ steps: [{ done: true }, { done: false }] }), 0.5);
  assert.equal(goalProgress({ steps: [] }), 0);
  assert.equal(goalProgress({ achieved: true }), 1);
});

test('dueReminders : rappels dont l’heure tombe dans (from, to]', async () => {
  const { dueReminders } = await import('../js/utils.js');
  const events = [
    { id: 'a', title: 'RDV avocat', start: '2026-11-25T10:00', end: '2026-11-25T11:00', reminder: '15' },
    { id: 'b', title: 'Sans rappel', start: '2026-11-25T10:00', end: '2026-11-25T11:00', reminder: '' },
    { id: 'c', title: 'Hebdo', start: '2026-11-04T10:00', end: '2026-11-04T10:30', repeat: 'weekly', reminder: '0' },
    { id: 'd', title: 'Veille', start: '2026-11-26T09:45', end: '2026-11-26T10:00', reminder: '1440' },
  ];
  const due = dueReminders(events, d('2026-11-25T09:40'), d('2026-11-25T10:00'));
  assert.deepEqual(due.map((r) => r.event.id).sort(), ['a', 'c', 'd']);
  const a = due.find((r) => r.event.id === 'a');
  assert.equal(+a.fireAt, +d('2026-11-25T09:45'));
  assert.equal(+a.start, +d('2026-11-25T10:00'));
  assert.ok(a.key.includes('a'));
  assert.equal(dueReminders(events, d('2026-11-25T09:45'), d('2026-11-25T09:50')).length, 0);
});
