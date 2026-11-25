// Stockage local (localStorage) avec mises à jour immuables.

import { uid } from './utils.js';

export const STORAGE_KEY = 'consilium:v1';
export const DEFAULT_DOMAINS = [
  'Numérique', 'Construction', 'Droit', 'Transport', 'Communication', 'Événementiel',
  'Logistique', 'Presse', 'Finances', 'Éducation', 'Santé', 'Administration', 'Autre',
];
const COLLECTIONS = ['events', 'contacts', 'goals'];

export const emptyState = () => ({ version: 1, events: [], contacts: [], goals: [], domains: [...DEFAULT_DOMAINS] });

/** Valide et normalise des données importées ou relues. Lève une Error lisible si invalide. */
export function validateData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Fichier invalide : ce n’est pas une sauvegarde Consilium.');
  }
  const out = emptyState();
  for (const name of COLLECTIONS) {
    const list = data[name] ?? [];
    if (!Array.isArray(list)) throw new Error(`Fichier invalide : « ${name} » doit être une liste.`);
    out[name] = list.filter((item) => item && typeof item === 'object' && typeof item.id === 'string');
  }
  if (data.domains !== undefined) {
    if (!Array.isArray(data.domains)) throw new Error('Fichier invalide : « domains » doit être une liste.');
    const names = data.domains.filter((d) => typeof d === 'string' && d.trim()).map((d) => d.trim());
    if (names.length) out.domains = [...new Set(names)];
  }
  return out;
}

function assertCollection(name) {
  if (!COLLECTIONS.includes(name)) throw new Error(`Collection inconnue : ${name}`);
}

export function createStore(storage) {
  const listeners = new Set();
  let state = load();

  function load() {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    try {
      return validateData(JSON.parse(raw));
    } catch (err) {
      // On ne perd jamais des données illisibles : copie de secours avant de repartir à vide.
      console.error('Consilium : données locales illisibles, copie de secours créée.', err);
      storage.setItem(`${STORAGE_KEY}:corrompu:${Date.now()}`, raw);
      return emptyState();
    }
  }

  function commit(next) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      console.error('Consilium : échec d’enregistrement', err);
      throw new Error('Impossible d’enregistrer : le stockage du navigateur est plein ou indisponible.');
    }
    state = next;
    listeners.forEach((fn) => fn(state));
  }

  return {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    upsert(collection, item) {
      assertCollection(collection);
      const saved = item.id ? item : { ...item, id: uid() };
      const list = state[collection];
      const exists = list.some((i) => i.id === saved.id);
      const nextList = exists ? list.map((i) => (i.id === saved.id ? saved : i)) : [...list, saved];
      commit({ ...state, [collection]: nextList });
      return saved;
    },
    remove(collection, id) {
      assertCollection(collection);
      commit({ ...state, [collection]: state[collection].filter((i) => i.id !== id) });
    },
    addDomain(name) {
      const clean = String(name ?? '').trim();
      if (!clean) throw new Error('Le nom du domaine est vide.');
      if (state.domains.some((d) => d.toLowerCase() === clean.toLowerCase())) {
        throw new Error('Ce domaine existe déjà.');
      }
      commit({ ...state, domains: [...state.domains, clean] });
    },
    replaceAll(data) {
      commit(validateData(data));
    },
  };
}
