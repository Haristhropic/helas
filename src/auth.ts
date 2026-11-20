/**
 * Two independent gates.
 *
 * Router auth protects the free-tier quota: an open endpoint is scraped within
 * days and somebody else's traffic burns your daily allowances. Dashboard auth is
 * a single password — this is a personal tool, not a multi-tenant product.
 */
import { eq } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { db } from './db/client.ts';
import { apiKeys } from './db/schema.ts';
import { env } from './env.ts';
import { hashApiKey } from './crypto/keys.ts';

const SESSION_COOKIE = 'router_session';
const SESSION_TTL_S = 60 * 60 * 12;

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

/** TextEncoder gives Uint8Array<ArrayBufferLike>; Web Crypto wants BufferSource. */
function utf8(text: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(text);
  const out = new Uint8Array(new ArrayBuffer(encoded.length));
  out.set(encoded);
  return out;
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sig = await crypto.subtle.sign('HMAC', key, utf8(payload));
  return b64url(new Uint8Array(sig));
}

async function makeSession(secret: string): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  const payload = `v1.${expires}`;
  return `${payload}.${await sign(payload, secret)}`;
}

async function verifySession(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [version, expires, shown] = parts;
  if (version !== 'v1') return false;
  if (Number(expires) * 1000 < Date.now()) return false;
  const expected = await sign(`${version}.${expires}`, secret);
  // Constant-time-ish: compare full strings without early exit.
  if (expected.length !== shown.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ shown.charCodeAt(i);
  }
  return diff === 0;
}

/* ── router auth ─────────────────────────────────────────────────────────── */

export const requireRouterKey: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!bearer) {
    return c.json(
      {
        error: {
          code: 'unauthorized',
          message: 'Missing bearer token. This router is not open to the internet.',
        },
      },
      401,
    );
  }

  // Constant-time compare against the env key, when one is configured.
  if (env.routerKey && bearer.length === env.routerKey.length) {
    let diff = 0;
    for (let i = 0; i < bearer.length; i++) {
      diff |= bearer.charCodeAt(i) ^ env.routerKey.charCodeAt(i);
    }
    if (diff === 0) return next();
  }

  if (!env.isDemo && bearer.startsWith('sk-')) {
    const hash = await hashApiKey(bearer);
    const rows = await db().select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).limit(1);
    if (rows.length > 0 && rows[0].revokedAt === null) return next();
  }

  return c.json({ error: { code: 'unauthorized', message: 'Invalid router key.' } }, 401);
};

/* ── dashboard auth ──────────────────────────────────────────────────────── */

function sessionSecret(): string {
  return env.sessionSecret || env.dashboardPassword || 'dev-only-insecure-secret';
}

export const requireDashboard: MiddlewareHandler = async (c, next) => {
  // With no password configured the dashboard is open — local development only.
  if (!env.dashboardPassword) return next();
  const token = getCookie(c, SESSION_COOKIE);
  if (await verifySession(token, sessionSecret())) return next();
  return c.redirect('/login');
};

export async function signIn(c: Context, password: string): Promise<boolean> {
  if (!env.dashboardPassword || password !== env.dashboardPassword) return false;
  setCookie(c, SESSION_COOKIE, await makeSession(sessionSecret()), {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_S,
  });
  return true;
}

export function signOut(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}
