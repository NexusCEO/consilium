// Synchronisation entre appareils, chiffrée de bout en bout (voir sync-crypto.js).
// Cycle : lire la copie en ligne → la déchiffrer et la fusionner ici → renvoyer le résultat
// s'il apporte du nouveau. Si un autre appareil a envoyé entre-temps (409), on recommence.

import { PUSH } from './config.js';
import { sameContent } from './merge.js';
import { decryptState, deriveSyncKeys, encryptState, generateSyncCode, normalizeSyncCode } from './sync-crypto.js';

const SETTINGS_KEY = 'consilium:sync';
const SYNC_DELAY_MS = 2000;
const PERIOD_MS = 60_000;
const MAX_ATTEMPTS = 3;

function readSettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? 'null');
    return saved && normalizeSyncCode(saved.code) ? saved : null;
  } catch {
    return null;
  }
}

function writeSettings(settings) {
  if (settings) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  else window.localStorage.removeItem(SETTINGS_KEY);
}

const endpoint = (id) => `${PUSH.serverUrl}/sync/${id}`;

async function fetchCopy(id) {
  const res = await fetch(endpoint(id), { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Serveur de synchronisation indisponible (erreur ${res.status}).`);
  return (await res.json()).data;
}

/** Renvoie la nouvelle version, ou null si un autre appareil a envoyé entre-temps. */
async function sendCopy(id, baseVersion, state, key) {
  const box = await encryptState(state, key);
  const res = await fetch(endpoint(id), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseVersion, ...box }),
  });
  if (res.status === 409) return null;
  if (res.status === 413) throw new Error('Données trop volumineuses pour la synchronisation.');
  if (!res.ok) throw new Error(`Serveur de synchronisation indisponible (erreur ${res.status}).`);
  return (await res.json()).data.version;
}

async function readRemote(copy, key) {
  try {
    return await decryptState(copy, key);
  } catch {
    throw new Error('Code de synchronisation incorrect : la copie en ligne ne peut pas être lue.');
  }
}

export function createSync(store) {
  let settings = readSettings();
  let keys = null;
  let running = null;
  let again = false;
  let timer;
  let status = { state: settings ? 'idle' : 'off', lastSync: settings?.lastSync ?? 0, error: '' };
  const listeners = new Set();

  const setStatus = (patch) => {
    status = { ...status, ...patch };
    listeners.forEach((fn) => fn(status));
  };
  const getKeys = async () => {
    keys = keys ?? await deriveSyncKeys(settings.code);
    return keys;
  };

  async function syncOnce() {
    const { id, key } = await getKeys();
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const copy = await fetchCopy(id);
      const remote = copy ? await readRemote(copy, key) : null;
      if (remote) store.merge(remote);
      const local = store.getState();
      if (remote && sameContent(local, remote)) return;
      if (await sendCopy(id, copy?.version ?? 0, local, key) !== null) return;
    }
    throw new Error('Trop de modifications simultanées sur vos appareils. Réessayez dans un instant.');
  }

  /** Lance une synchronisation (ou en reprogramme une si l'une est déjà en cours). */
  function syncNow() {
    if (!settings || !PUSH.serverUrl) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    setStatus({ state: 'syncing', error: '' });
    running = syncOnce()
      .then(() => {
        settings = { ...settings, lastSync: Date.now() };
        writeSettings(settings);
        setStatus({ state: 'ok', lastSync: settings.lastSync });
      })
      .catch((err) => {
        console.error('Synchronisation impossible', err);
        setStatus({ state: 'error', error: navigator.onLine === false ? 'Hors ligne : la synchronisation reprendra au retour du réseau.' : err.message });
      })
      .finally(() => {
        running = null;
        if (again) {
          again = false;
          syncNow();
        }
      });
    return running;
  }

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(syncNow, SYNC_DELAY_MS);
  };

  function start() {
    store.subscribe(schedule);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
    window.addEventListener('online', () => syncNow());
    setInterval(() => { if (!document.hidden) syncNow(); }, PERIOD_MS);
    syncNow();
  }

  function use(code) {
    settings = { code, lastSync: 0 };
    keys = null;
    writeSettings(settings);
  }

  return {
    start,
    syncNow,
    status: () => status,
    code: () => settings?.code ?? '',
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Premier appareil : crée un code et envoie les données. */
    async enable() {
      use(generateSyncCode());
      await syncNow();
      return settings.code;
    },
    /** Autre appareil : rejoint une copie existante et fusionne ses données avec celles d'ici. */
    async join(input) {
      const code = normalizeSyncCode(input);
      if (!code) throw new Error('Code invalide : il comporte 20 caractères (lettres et chiffres).');
      const { id } = await deriveSyncKeys(code);
      if (!await fetchCopy(id)) throw new Error('Aucune donnée trouvée pour ce code. Vérifiez-le sur l’autre appareil.');
      use(code);
      await syncNow();
      if (status.state === 'error') throw new Error(status.error);
    },
    /** Arrête sur cet appareil ; les données restent ici et en ligne. */
    disable() {
      settings = null;
      keys = null;
      writeSettings(null);
      setStatus({ state: 'off', lastSync: 0, error: '' });
    },
    /** Efface la copie en ligne (pour tous les appareils), puis arrête ici. */
    async eraseOnline() {
      const { id } = await getKeys();
      const res = await fetch(endpoint(id), { method: 'DELETE' });
      if (!res.ok) throw new Error(`Effacement impossible (erreur ${res.status}).`);
      this.disable();
    },
  };
}
