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
