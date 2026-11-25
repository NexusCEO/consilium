// Validation des données reçues de l'application.

export const MAX_BODY_BYTES = 32 * 1024;
export const MAX_TIMES = 500;
const HORIZON_MS = 40 * 24 * 60 * 60_000;

// Seuls les services de notification des navigateurs sont acceptés (empêche d'utiliser le serveur pour appeler n'importe quelle adresse).
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Android, Edge
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^web\.push\.apple\.com$/, // Safari, iPhone
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Windows
];

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Adresse d'abonnement aux notifications, ou HttpError 400. */
export function parseEndpoint(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new HttpError(400, 'Adresse de notification invalide.');
  }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some((re) => re.test(url.hostname))) {
    throw new HttpError(400, 'Service de notification non pris en charge.');
  }
  return url.href;
}

/** Heures de rappel (ms) futures et à moins de 40 jours, dédoublonnées et triées. */
export function parseTimes(value, now) {
  if (!Array.isArray(value)) throw new HttpError(400, '« times » doit être une liste.');
  if (value.length > MAX_TIMES) throw new HttpError(400, `Pas plus de ${MAX_TIMES} rappels à la fois.`);
  if (!value.every((t) => Number.isInteger(t))) throw new HttpError(400, 'Heures de rappel invalides.');
  return [...new Set(value)].filter((t) => t > now && t <= now + HORIZON_MS).sort((a, b) => a - b);
}

/** Taille maximale d'une copie chiffrée synchronisée (D1 accepte 2 Mo par valeur). */
export const MAX_SYNC_BYTES = 1_500_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Identifiant de copie synchronisée : empreinte SHA-256 en hexadécimal. */
export function parseSyncId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new HttpError(400, 'Identifiant de synchronisation invalide.');
  }
  return value;
}

/** Copie chiffrée envoyée par un appareil : le serveur ne peut ni ne doit la lire. */
export function parseSyncBody(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Données de synchronisation manquantes.');
  const { baseVersion, iv, data } = body;
  if (!Number.isInteger(baseVersion) || baseVersion < 0) throw new HttpError(400, 'Version invalide.');
  if (typeof iv !== 'string' || iv.length !== 16 || !BASE64.test(iv)) throw new HttpError(400, 'Vecteur de chiffrement invalide.');
  if (typeof data !== 'string' || !data || !BASE64.test(data)) throw new HttpError(400, 'Données chiffrées invalides.');
  return { baseVersion, iv, data };
}
