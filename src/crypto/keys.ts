/**
 * Provider-key encryption. AES-256-GCM via Web Crypto — no native deps, works in
 * the Vercel Node runtime and in plain `tsx`.
 *
 * Threat model: a database dump on its own must not yield usable provider keys.
 * It does not protect against env-var exposure, which is why KEY_ENC_MASTER lives
 * only in Vercel's encrypted env store and is never written to Neon.
 *
 * AAD is bound to `${providerId}:${keyVersion}`. An attacker with write access to
 * the table cannot move a ciphertext from one provider row to another, and cannot
 * roll a key back to an older version without the decrypt failing.
 */
import { env } from '../env.ts';

const ALGO = 'AES-GCM';
const IV_BYTES = 12;
const TAG_BITS = 128;

export interface SealedKey {
  ciphertext: string; // base64 (ciphertext || tag)
  iv: string; // base64
  keyVersion: number;
  keyHint: string;
}

function b64encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/** TextEncoder and Buffer both give Uint8Array<ArrayBufferLike>; Web Crypto wants BufferSource. */
type Bytes = Uint8Array<ArrayBuffer>;

function bytes(n: number): Bytes {
  return new Uint8Array(new ArrayBuffer(n));
}

function utf8(text: string): Bytes {
  const encoded = new TextEncoder().encode(text);
  const out = bytes(encoded.length);
  out.set(encoded);
  return out;
}

function b64decode(text: string): Bytes {
  const src = Buffer.from(text, 'base64');
  const out = bytes(src.byteLength);
  out.set(src);
  return out;
}

let cachedMaster: CryptoKey | null = null;

async function masterKey(): Promise<CryptoKey> {
  if (cachedMaster) return cachedMaster;
  const raw = env.masterKey;
  if (!raw) {
    throw new Error(
      'KEY_ENC_MASTER is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  const bytes = b64decode(raw);
  if (bytes.length !== 32) {
    throw new Error(`KEY_ENC_MASTER must decode to 32 bytes, got ${bytes.length}`);
  }
  cachedMaster = await crypto.subtle.importKey('raw', bytes, { name: ALGO }, false, [
    'encrypt',
    'decrypt',
  ]);
  return cachedMaster;
}

function aad(providerId: string, keyVersion: number): Bytes {
  return utf8(`${providerId}:${keyVersion}`);
}

export async function sealKey(
  plaintext: string,
  providerId: string,
  keyVersion = 1,
): Promise<SealedKey> {
  const key = await masterKey();
  const iv = crypto.getRandomValues(bytes(IV_BYTES));
  const buf = await crypto.subtle.encrypt(
    { name: ALGO, iv, additionalData: aad(providerId, keyVersion), tagLength: TAG_BITS },
    key,
    utf8(plaintext),
  );
  return {
    ciphertext: b64encode(new Uint8Array(buf)),
    iv: b64encode(iv),
    keyVersion,
    keyHint: plaintext.slice(-4),
  };
}

export async function openKey(row: {
  ciphertext: string;
  iv: string;
  keyVersion: number;
  providerId: string;
}): Promise<string> {
  const key = await masterKey();
  const buf = await crypto.subtle.decrypt(
    {
      name: ALGO,
      iv: b64decode(row.iv),
      additionalData: aad(row.providerId, row.keyVersion),
      tagLength: TAG_BITS,
    },
    key,
    b64decode(row.ciphertext),
  );
  return new TextDecoder().decode(buf);
}

/* ── decrypted-key cache ──────────────────────────────────────────────────
 * AES-GCM is cheap, but it is still an async hop on the hot path. Fluid compute
 * keeps a module instance warm across invocations, so a short TTL here removes
 * it from most requests without holding plaintext long.
 */
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: string; expires: number }>();

export async function openKeyCached(row: {
  id: string;
  ciphertext: string;
  iv: string;
  keyVersion: number;
  providerId: string;
}): Promise<string> {
  const now = Date.now();
  const hit = cache.get(row.id);
  if (hit && hit.expires > now) return hit.value;

  const value = await openKey(row);
  cache.set(row.id, { value, expires: now + TTL_MS });
  return value;
}

export function forgetKey(id: string): void {
  cache.delete(id);
}

export function clearKeyCache(): void {
  cache.clear();
}

/** SHA-256 of a client key. Router keys are stored hashed, never in the clear. */
export async function hashApiKey(plaintext: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', utf8(plaintext));
  return Buffer.from(new Uint8Array(digest)).toString('hex');
}

export function generateApiKey(): string {
  const raw = crypto.getRandomValues(new Uint8Array(24));
  return `sk-${Buffer.from(raw).toString('hex')}`;
}

export function generateId(): string {
  return crypto.randomUUID();
}
