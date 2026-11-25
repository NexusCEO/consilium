// Chiffrement de bout en bout de la synchronisation.
// Le code (20 caractères aléatoires, ~100 bits) ne quitte jamais l'appareil : on en dérive
//  - une clé AES-GCM qui chiffre toutes les données avant l'envoi ;
//  - un identifiant (empreinte) qui désigne la copie chiffrée sur le serveur.
// Le serveur ne voit donc jamais ni le code, ni la clé, ni le contenu.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford : sans I, L, O, U (pas de confusion)
const CODE_LENGTH = 20;
const GROUP = 5;
const SALT = 'consilium-sync-v1';
const ITERATIONS = 100_000;
const IV_BYTES = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const group = (raw) => raw.match(new RegExp(`.{${GROUP}}`, 'g')).join('-');

export function generateSyncCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return group([...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')); // 256 % 32 = 0 : pas de biais
}

/** Code saisi (minuscules, espaces, O/I/L confondus) → forme canonique, ou null s'il est invalide. */
export function normalizeSyncCode(input) {
  const raw = String(input ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (raw.length !== CODE_LENGTH || [...raw].some((ch) => !ALPHABET.includes(ch))) return null;
  return group(raw);
}

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** @returns {Promise<{id: string, key: CryptoKey}>} */
export async function deriveSyncKeys(code) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(SALT), iterations: ITERATIONS }, base, 512,
  ));
  const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const id = toHex(await crypto.subtle.digest('SHA-256', bits.slice(32)));
  return { id, key };
}

export async function encryptState(state, key) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(state)));
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(cipher)) };
}

/** Lève une erreur si le code ne correspond pas (ou si les données ont été altérées). */
export async function decryptState(box, key) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(box.iv) }, key, fromBase64(box.data));
  return JSON.parse(decoder.decode(plain));
}
