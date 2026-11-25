import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, parseEndpoint, parseTimes } from '../src/validate.js';
import { sendPush, vapidAuthorization } from '../src/vapid.js';

const NOW = Date.UTC(2026, 10, 25, 9, 0);
const MINUTE = 60_000;

test('parseEndpoint accepte les services de notification connus', () => {
  for (const url of [
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QF1abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ]) assert.equal(parseEndpoint(url), url);
});

test('parseEndpoint refuse tout autre adresse', () => {
  for (const url of ['http://fcm.googleapis.com/x', 'https://evil.example.com/x', 'https://fcm.googleapis.com.evil.com/x', 'pas une url', undefined]) {
    assert.throws(() => parseEndpoint(url), HttpError, String(url));
  }
});

test('parseTimes garde les heures futures (≤ 40 j), dédoublonnées et triées', () => {
  const times = [NOW + 5 * MINUTE, NOW - MINUTE, NOW + 5 * MINUTE, NOW + 41 * 24 * 60 * MINUTE, NOW + 2 * MINUTE];
  assert.deepEqual(parseTimes(times, NOW), [NOW + 2 * MINUTE, NOW + 5 * MINUTE]);
});

test('parseTimes refuse un format invalide ou trop de rappels', () => {
  assert.throws(() => parseTimes('x', NOW), HttpError);
  assert.throws(() => parseTimes([NOW + MINUTE, 'demain'], NOW), HttpError);
  assert.throws(() => parseTimes(Array.from({ length: 501 }, (_, i) => NOW + i + 1), NOW), HttpError);
});

async function makeKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return {
    pair,
    vapid: {
      privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
      publicKey: Buffer.from(raw).toString('base64url'),
      subject: 'https://nexusceo.github.io/consilium/',
    },
  };
}

test('en-tête VAPID : jeton ES256 signé, audience = origine du service', async () => {
  const { pair, vapid } = await makeKeys();
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', vapid, NOW);
  const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  assert.equal(k, vapid.publicKey);
  const [h, c, s] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url').toString()), { typ: 'JWT', alg: 'ES256' });
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.sub, vapid.subject);
  assert.ok(claims.exp > NOW / 1000 && claims.exp <= NOW / 1000 + 24 * 3600);
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${h}.${c}`));
  assert.ok(valid);
});

test('sendPush envoie une notification vide avec TTL et renvoie le statut', async () => {
  const { vapid } = await makeKeys();
  let seen;
  const status = await sendPush('https://web.push.apple.com/abc', vapid, async (url, init) => { seen = { url, init }; return { status: 201 }; });
  assert.equal(status, 201);
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.TTL, '3600');
  assert.match(seen.init.headers.Authorization, /^vapid t=/);
});
