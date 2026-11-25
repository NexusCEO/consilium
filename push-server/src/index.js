// Serveur de rappels Consilium (Cloudflare Worker + D1).
//   PUT    /reminders  {endpoint, times[]}  remplace les heures de rappel d'un appareil
//   DELETE /reminders  {endpoint}           désabonne un appareil
//   tâche planifiée (chaque minute)        envoie les notifications arrivées à échéance

import { HttpError, MAX_BODY_BYTES, parseEndpoint, parseTimes } from './validate.js';
import { sendPush } from './vapid.js';

const SEND_BATCH = 200;
const ROWS_PER_INSERT = 45; // D1 : 100 paramètres max par requête, 2 par ligne
const IDS_PER_DELETE = 90;
const LATE_LIMIT_MS = 60 * 60_000;
const SUBSCRIPTION_MAX_AGE_MS = 60 * 24 * 60 * 60_000;

const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') ?? '';
  if (!String(env.ALLOWED_ORIGINS ?? '').split(',').includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const reply = (status, body, headers) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', ...headers },
});

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'Requête trop volumineuse.');
  try {
    return JSON.parse(text) ?? {};
  } catch {
    throw new HttpError(400, 'JSON invalide.');
  }
}

async function subscriptionId(endpoint) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function putReminders(request, env, now) {
  const body = await readJson(request);
  const endpoint = parseEndpoint(body.endpoint);
  const times = parseTimes(body.times, now);
  const id = await subscriptionId(endpoint);
  const inserts = chunk(times, ROWS_PER_INSERT).map((rows) => env.DB
    .prepare(`INSERT INTO reminders (subscription_id, fire_at) VALUES ${rows.map(() => '(?, ?)').join(', ')}`)
    .bind(...rows.flatMap((t) => [id, t])));
  await env.DB.batch([
    env.DB.prepare('INSERT INTO subscriptions (id, endpoint, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET endpoint = ?2, updated_at = ?3').bind(id, endpoint, now),
    env.DB.prepare('DELETE FROM reminders WHERE subscription_id = ?1').bind(id),
    ...inserts,
  ]);
  return { count: times.length };
}

async function deleteSubscription(request, env) {
  const id = await subscriptionId(parseEndpoint((await readJson(request)).endpoint));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reminders WHERE subscription_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM subscriptions WHERE id = ?1').bind(id),
  ]);
  return { deleted: true };
}

async function checkRateLimit(request, env) {
  if (!env.LIMITER) return;
  const { success } = await env.LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'inconnu' });
  if (!success) throw new HttpError(429, 'Trop de requêtes, réessayez dans une minute.');
}

async function handleRequest(request, env) {
  const headers = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const { pathname } = new URL(request.url);
  try {
    if (pathname === '/') return reply(200, { success: true, data: { service: 'consilium-push' } }, headers);
    if (pathname !== '/reminders') throw new HttpError(404, 'Introuvable.');
    await checkRateLimit(request, env);
    if (request.method === 'PUT') return reply(200, { success: true, data: await putReminders(request, env, Date.now()) }, headers);
    if (request.method === 'DELETE') return reply(200, { success: true, data: await deleteSubscription(request, env) }, headers);
    throw new HttpError(405, 'Méthode non autorisée.');
  } catch (err) {
    if (err instanceof HttpError) return reply(err.status, { success: false, error: err.message }, headers);
    console.error('Erreur inattendue', err);
    return reply(500, { success: false, error: 'Erreur du serveur.' }, headers);
  }
}

function vapidConfig(env) {
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC_KEY || !env.VAPID_SUBJECT) throw new Error('Clés VAPID non configurées.');
  return { privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK), publicKey: env.VAPID_PUBLIC_KEY, subject: env.VAPID_SUBJECT };
}

/** Envoie les rappels arrivés à échéance, puis les supprime. Renvoie le nombre d'envois réussis. */
export async function sendDueReminders(env, now, send = sendPush) {
  const vapid = vapidConfig(env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reminders WHERE fire_at < ?1').bind(now - LATE_LIMIT_MS),
    env.DB.prepare('DELETE FROM reminders WHERE subscription_id IN (SELECT id FROM subscriptions WHERE updated_at < ?1)').bind(now - SUBSCRIPTION_MAX_AGE_MS),
    env.DB.prepare('DELETE FROM subscriptions WHERE updated_at < ?1').bind(now - SUBSCRIPTION_MAX_AGE_MS),
  ]);
  const { results } = await env.DB
    .prepare('SELECT r.id, r.subscription_id AS sid, s.endpoint FROM reminders r JOIN subscriptions s ON s.id = r.subscription_id WHERE r.fire_at <= ?1 ORDER BY r.fire_at LIMIT ?2')
    .bind(now, SEND_BATCH).all();
  if (!results.length) return 0;
  const expired = new Set();
  const statuses = await Promise.all(results.map(async (row) => {
    try {
      const status = await send(row.endpoint, vapid);
      if (status === 404 || status === 410) expired.add(row.sid);
      else if (status >= 400) console.error('Notification refusée', status, new URL(row.endpoint).hostname);
      return status;
    } catch (err) {
      console.error('Envoi impossible', new URL(row.endpoint).hostname, err);
      return 0;
    }
  }));
  await env.DB.batch([
    ...chunk(results.map((r) => r.id), IDS_PER_DELETE).map((ids) => env.DB
      .prepare(`DELETE FROM reminders WHERE id IN (${ids.map(() => '?').join(', ')})`).bind(...ids)),
    ...[...expired].flatMap((sid) => [
      env.DB.prepare('DELETE FROM reminders WHERE subscription_id = ?1').bind(sid),
      env.DB.prepare('DELETE FROM subscriptions WHERE id = ?1').bind(sid),
    ]),
  ]);
  return statuses.filter((s) => s >= 200 && s < 300).length;
}

export default {
  fetch: handleRequest,
  scheduled(controller, env, ctx) {
    ctx.waitUntil(sendDueReminders(env, Date.now()).catch((err) => console.error('Tâche des rappels en échec', err)));
  },
};
