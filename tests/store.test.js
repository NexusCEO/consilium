import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, STORAGE_KEY, validateData } from '../js/store.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  };
}

test('upsert ajoute puis remplace sans muter l’état précédent', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  const before = store.getState();
  const saved = store.upsert('contacts', { firstName: 'Awa', domain: 'Droit' });
  assert.ok(saved.id);
  assert.equal(before.contacts.length, 0);
  store.upsert('contacts', { ...saved, firstName: 'Awa K.' });
  assert.equal(store.getState().contacts.length, 1);
  assert.equal(store.getState().contacts[0].firstName, 'Awa K.');
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).contacts[0].firstName, 'Awa K.');
});

test('remove supprime et notifie les abonnés', () => {
  const store = createStore(memoryStorage());
  const { id } = store.upsert('goals', { title: 'Lire 12 livres' });
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  store.remove('goals', id);
  assert.equal(store.getState().goals.length, 0);
  assert.equal(calls, 1);
});

test('addDomain refuse les doublons (casse ignorée) et le vide', () => {
  const store = createStore(memoryStorage());
  store.addDomain('Agriculture');
  assert.ok(store.getState().domains.includes('Agriculture'));
  assert.throws(() => store.addDomain('numérique'), /existe déjà/);
  assert.throws(() => store.addDomain('  '), /vide/);
});

test('un échec d’écriture laisse l’état intact', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => store.upsert('events', { title: 'x' }), /stockage/);
  assert.equal(store.getState().events.length, 0);
});

test('données locales corrompues : copie de secours conservée', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: '{pas du json' });
  const store = createStore(storage);
  assert.equal(store.getState().events.length, 0);
  const backup = [...storage.data.keys()].find((k) => k.startsWith(`${STORAGE_KEY}:corrompu:`));
  assert.equal(storage.getItem(backup), '{pas du json');
});

test('validateData rejette les formats invalides et filtre les éléments sans id', () => {
  assert.throws(() => validateData(null), /invalide/);
  assert.throws(() => validateData({ events: 'x' }), /liste/);
  const out = validateData({ events: [{ id: '1' }, { title: 'sans id' }], domains: ['A', 'A', ' '] });
  assert.equal(out.events.length, 1);
  assert.deepEqual(out.domains, ['A']);
});
