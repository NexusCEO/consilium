// Fusion de deux états Consilium (cet appareil et la copie synchronisée).
// Règle : pour chaque élément, la version la plus récente (updatedAt) l'emporte ; une suppression
// (trace datée dans `deleted`) l'emporte sur toute version plus ancienne qu'elle.

export const SYNCED_COLLECTIONS = ['events', 'contacts', 'goals'];
const TOMBSTONE_MAX_AGE_MS = 180 * 24 * 60 * 60_000;

const stamp = (item) => Number(item?.updatedAt) || 0;

/** Plus récent gagne ; à égalité, choix stable quel que soit l'ordre (fusion symétrique). */
function newer(a, b) {
  if (stamp(a) !== stamp(b)) return stamp(a) > stamp(b) ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

function mergeCollection(name, a, b, now) {
  const tombs = {};
  for (const source of [a.deleted?.[name], b.deleted?.[name]]) {
    for (const [id, at] of Object.entries(source ?? {})) tombs[id] = Math.max(tombs[id] ?? 0, Number(at) || 0);
  }
  const latest = new Map();
  for (const item of [...(a[name] ?? []), ...(b[name] ?? [])]) {
    latest.set(item.id, latest.has(item.id) ? newer(latest.get(item.id), item) : item);
  }
  const items = [...latest.values()]
    .filter((item) => stamp(item) > (tombs[item.id] ?? -1))
    .sort((x, y) => (x.id < y.id ? -1 : 1));
  const alive = new Set(items.map((item) => item.id));
  const deleted = Object.fromEntries(Object.entries(tombs)
    .filter(([id, at]) => !alive.has(id) && now - at < TOMBSTONE_MAX_AGE_MS));
  return { items, deleted };
}

export function mergeStates(a, b, now = Date.now()) {
  const out = { version: 1, domains: [...new Set([...(a.domains ?? []), ...(b.domains ?? [])])], deleted: {} };
  for (const name of SYNCED_COLLECTIONS) {
    const { items, deleted } = mergeCollection(name, a, b, now);
    out[name] = items;
    out.deleted[name] = deleted;
  }
  return out;
}

/** Comparaison de contenu (pour savoir s'il y a quelque chose à enregistrer ou à envoyer). */
export function sameContent(a, b) {
  const canonical = (s) => JSON.stringify(mergeStates(s, { domains: [] }, 0));
  return canonical(a) === canonical(b);
}
