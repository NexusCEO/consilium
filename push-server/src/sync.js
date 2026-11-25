// Copie synchronisée des données Consilium, chiffrée par les appareils (le serveur ne peut pas la lire).
//   GET    /sync/:id   → { version, iv, data }   (404 si aucune copie)
//   PUT    /sync/:id   { baseVersion, iv, data } → { version }  (409 si un autre appareil a envoyé entre-temps)
//   DELETE /sync/:id   efface la copie en ligne

import { HttpError, MAX_SYNC_BYTES, parseSyncBody, parseSyncId } from './validate.js';

async function getCopy(env, id) {
  const row = await env.DB.prepare('SELECT version, iv, data FROM sync_copies WHERE id = ?1').bind(id).first();
  if (!row) throw new HttpError(404, 'Aucune copie synchronisée pour ce code.');
  return { version: row.version, iv: row.iv, data: row.data };
}

/** Écrit seulement si la copie n'a pas changé depuis `baseVersion` (sinon 409 : l'appareil doit fusionner d'abord). */
async function putCopy(env, id, body, now) {
  const { baseVersion, iv, data } = parseSyncBody(body);
  const result = baseVersion === 0
    ? await env.DB.prepare('INSERT INTO sync_copies (id, version, iv, data, updated_at) VALUES (?1, 1, ?2, ?3, ?4) ON CONFLICT(id) DO NOTHING')
      .bind(id, iv, data, now).run()
    : await env.DB.prepare('UPDATE sync_copies SET version = version + 1, iv = ?2, data = ?3, updated_at = ?4 WHERE id = ?1 AND version = ?5')
      .bind(id, iv, data, now, baseVersion).run();
  if (!result.meta.changes) throw new HttpError(409, 'La copie a changé sur un autre appareil : fusion nécessaire.');
  return { version: baseVersion + 1 };
}

async function deleteCopy(env, id) {
  await env.DB.prepare('DELETE FROM sync_copies WHERE id = ?1').bind(id).run();
  return { deleted: true };
}

/** @param readJson (request, maxBytes) → objet */
export async function handleSync(request, env, rawId, readJson) {
  const id = parseSyncId(rawId);
  if (request.method === 'GET') return getCopy(env, id);
  if (request.method === 'PUT') return putCopy(env, id, await readJson(request, MAX_SYNC_BYTES), Date.now());
  if (request.method === 'DELETE') return deleteCopy(env, id);
  throw new HttpError(405, 'Méthode non autorisée.');
}
