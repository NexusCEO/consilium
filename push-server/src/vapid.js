// Envoi Web Push sans contenu (RFC 8030) signé VAPID (RFC 8292).
// Sans contenu : aucun détail de rendez-vous ne transite ; le téléphone complète la notification.

const TOKEN_LIFETIME_S = 12 * 3600;
const PUSH_TTL_S = '3600';
const encoder = new TextEncoder();

const base64Url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jsonPart = (value) => base64Url(encoder.encode(JSON.stringify(value)));

/**
 * En-tête Authorization VAPID pour un service de notification.
 * @param {{privateJwk: JsonWebKey, publicKey: string, subject: string}} vapid
 */
export async function vapidAuthorization(endpoint, vapid, now = Date.now()) {
  const header = jsonPart({ typ: 'JWT', alg: 'ES256' });
  const claims = jsonPart({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + TOKEN_LIFETIME_S, sub: vapid.subject });
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${base64Url(signature)}, k=${vapid.publicKey}`;
}

/** Envoie une notification vide ; renvoie le code HTTP du service (201 = accepté, 404/410 = abonnement expiré). */
export async function sendPush(endpoint, vapid, fetchImpl = fetch) {
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidAuthorization(endpoint, vapid), TTL: PUSH_TTL_S, Urgency: 'high', 'Content-Length': '0' },
  });
  return response.status;
}
