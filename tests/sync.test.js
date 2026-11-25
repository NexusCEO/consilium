import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates } from '../js/merge.js';
import { decryptState, deriveSyncKeys, encryptState, generateSyncCode, normalizeSyncCode } from '../js/sync-crypto.js';
import { createStore, emptyState } from '../js/store.js';

const base = () => emptyState();
const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
};

test('fusion : chaque élément garde sa version la plus récente', () => {
  const local = { ...base(), contacts: [{ id: 'a', firstName: 'Awa', updatedAt: 200 }, { id: 'b', firstName: 'Local', updatedAt: 100 }] };
  const remote = { ...base(), contacts: [{ id: 'a', firstName: 'Awa (ancien)', updatedAt: 150 }, { id: 'b', firstName: 'Distant', updatedAt: 300 }, { id: 'c', firstName: 'Nouveau', updatedAt: 50 }] };
  const merged = mergeStates(local, remote);
  const byId = Object.fromEntries(merged.contacts.map((c) => [c.id, c.firstName]));
  assert.deepEqual(byId, { a: 'Awa', b: 'Distant', c: 'Nouveau' });
});

test('fusion : une suppression l’emporte sur une version plus ancienne, pas sur une plus récente', () => {
  const local = { ...base(), events: [], deleted: { events: { e1: 500, e2: 100 } } };
  const remote = { ...base(), events: [{ id: 'e1', title: 'Supprimé ailleurs', updatedAt: 400 }, { id: 'e2', title: 'Modifié après', updatedAt: 200 }] };
  const merged = mergeStates(local, remote, 1000);
  assert.deepEqual(merged.events.map((e) => e.id), ['e2']);
  assert.equal(merged.deleted.events.e1, 500);
  assert.equal(merged.deleted.events.e2, undefined);
});

test('fusion : domaines réunis, sans doublon', () => {
  const merged = mergeStates({ ...base(), domains: ['Droit', 'Agriculture'] }, { ...base(), domains: ['Droit', 'Sport'] });
  assert.ok(['Droit', 'Agriculture', 'Sport'].every((d) => merged.domains.includes(d)));
  assert.equal(merged.domains.filter((d) => d === 'Droit').length, 1);
});

test('fusion : symétrique (même résultat dans les deux sens)', () => {
  const a = { ...base(), goals: [{ id: 'g', title: 'A', updatedAt: 1 }], deleted: { goals: { x: 9 } } };
  const b = { ...base(), goals: [{ id: 'g', title: 'B', updatedAt: 2 }, { id: 'x', title: 'X', updatedAt: 3 }] };
  assert.deepEqual(mergeStates(a, b).goals, mergeStates(b, a).goals);
});

test('store : date de modification à l’enregistrement, trace à la suppression', () => {
  const store = createStore(memoryStorage());
  const saved = store.upsert('events', { title: 'RDV' });
  assert.ok(saved.updatedAt > 0);
  store.remove('events', saved.id);
  assert.ok(store.getState().deleted.events[saved.id] >= saved.updatedAt);
});

test('code de synchronisation : format lisible, tolérant à la saisie', () => {
  const code = generateSyncCode();
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
  assert.equal(normalizeSyncCode(code.toLowerCase().replace(/-/g, ' ')), code);
  assert.equal(normalizeSyncCode('trop court'), null);
});

test('chiffrement : aller-retour, identifiant stable, mauvais code refusé', async () => {
  const code = generateSyncCode();
  const keys = await deriveSyncKeys(code);
  assert.match(keys.id, /^[0-9a-f]{64}$/);
  assert.equal((await deriveSyncKeys(code)).id, keys.id);
  const state = { ...base(), contacts: [{ id: 'a', firstName: 'Awa', updatedAt: 1 }] };
  const box = await encryptState(state, keys.key);
  assert.ok(!box.data.includes('Awa'));
  assert.deepEqual(await decryptState(box, keys.key), state);
  const other = await deriveSyncKeys(generateSyncCode());
  await assert.rejects(() => decryptState(box, other.key));
});

test('fusion : les traces de suppression de plus de 180 jours sont oubliées', () => {
  const day = 86_400_000;
  const merged = mergeStates({ ...base(), deleted: { events: { vieux: 0, recent: 200 * day } } }, base(), 200 * day);
  assert.deepEqual(Object.keys(merged.deleted.events), ['recent']);
});

test('store.merge : ne réenregistre rien si la copie n’apporte rien (pas de boucle)', () => {
  const store = createStore(memoryStorage());
  store.upsert('contacts', { firstName: 'Awa' });
  let commits = 0;
  store.subscribe(() => { commits += 1; });
  assert.equal(store.merge(store.getState()), false);
  assert.equal(store.merge({ ...emptyState(), contacts: [{ id: 'z', firstName: 'Yao', updatedAt: 1 }] }), true);
  assert.equal(commits, 1);
  assert.equal(store.getState().contacts.length, 2);
});
