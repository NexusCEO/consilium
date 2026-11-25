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
  const avocat = items.find((i) => i.title === 'RDV avocat');
  assert.equal(avocat.fireAt, +parseLocal('2026-11-26T09:45'));
  assert.equal(avocat.location, 'Plateau');
  assert.equal(avocat.minutes, 15);
  assert.ok(!items.some((i) => i.title === 'Sans rappel'));
  assert.equal(items.filter((i) => i.title === 'Hebdo').length, 4); // 30 nov., 7, 14, 21 déc.
  assert.ok(items.every((i) => i.fireAt > +now && i.fireAt <= +now + 30 * 86_400_000));
});
