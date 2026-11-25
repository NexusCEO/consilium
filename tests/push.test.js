import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upcomingReminders } from '../js/push.js';
import { parseLocal } from '../js/utils.js';

test('upcomingReminders : 30 jours de rappels, avec les détails gardés sur l’appareil', () => {
  const events = [
    { id: 'a', title: 'RDV avocat', location: 'Plateau', start: '2026-11-26T10:00', end: '2026-11-26T11:00', reminder: '15' },
    { id: 'b', title: 'Sans rappel', start: '2026-11-26T10:00', end: '2026-11-26T11:00', reminder: '' },
    { id: 'c', title: 'Hebdo', start: '2026-11-02T07:00', end: '2026-11-02T08:00', repeat: 'weekly', reminder: '0' },
  ];
  const now = parseLocal('2026-11-25T12:00');
  const items = upcomingReminders(events, now);
  const avocat = items.find((i) => i.title === 'Rappel : RDV avocat');
  assert.equal(avocat.fireAt, +parseLocal('2026-11-26T09:45'));
  assert.equal(avocat.body, 'À 10:00 · Plateau');
  assert.equal(avocat.url, './#/agenda');
  assert.ok(!items.some((i) => i.title.includes('Sans rappel')));
  assert.equal(items.filter((i) => i.title === 'Rappel : Hebdo').length, 4); // 30 nov., 7, 14, 21 déc.
  assert.ok(items.every((i) => i.fireAt > +now && i.fireAt <= +now + 30 * 86_400_000));
});

test('upcomingReminders inclut les échéances d’objectifs', async () => {
  const { goalReminderEvents } = await import('../js/utils.js');
  const items = upcomingReminders(goalReminderEvents([{ id: 'g', title: 'Épargne', deadline: '2026-12-10', reminder: '1440' }]), parseLocal('2026-11-25T12:00'));
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Objectif : Épargne');
  assert.equal(items[0].fireAt, +parseLocal('2026-12-09T09:00'));
  assert.equal(items[0].url, './#/objectifs');
});
