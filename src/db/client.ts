/**
 * Neon over the HTTP driver.
 *
 * We use `neon()` (one-shot HTTP queries) rather than a pooled socket driver:
 * Vercel functions are isolated and short-lived, and a TCP pool per invocation
 * is how you exhaust Postgres connections. Every statement here is a single
 * round trip; multi-statement transactions go through `sql.transaction`.
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.ts';
import { env } from '../env.ts';

let cached: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  if (!cached) {
    const sql = neon(env.databaseUrl);
    cached = drizzle(sql, { schema });
  }
  return cached;
}

export { schema };
