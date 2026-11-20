/**
 * Quota accounting in Postgres.
 *
 * The rule that shapes this file: **one query per request, not one per
 * candidate.** A fallback chain can hold a dozen models; a query each would add
 * hundreds of milliseconds before the first byte. So `loadCounters` reads every
 * counter for the current day and minute in a single range scan, and the chain
 * filter runs in memory.
 *
 * Writes happen after the response completes, via `waitUntil`, so the client
 * never waits on accounting.
 */
import { and, eq, gte, inArray } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { quotaBuckets, quotaLimits } from '../db/schema.ts';
import { env } from '../env.ts';

export type BucketKind = 'minute' | 'day';

export interface Candidate {
  providerId: string;
  modelId: string;
  /** '' when the limit applies to the whole provider. */
  limitModelId: string;
}

export interface Counter {
  requests: number;
  tokens: number;
}

export interface Limit {
  maxRequests: number | null;
  maxTokens: number | null;
}

export function bucketStart(kind: BucketKind, now = new Date()): Date {
  if (kind === 'minute') {
    const d = new Date(now);
    d.setUTCSeconds(0, 0);
    return d;
  }
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/* ── in-memory store, used when DATABASE_URL is absent (demo mode) ───────── */

const memCounters = new Map<string, Counter>();
const memLimits = new Map<string, Limit>();

function memKey(providerId: string, modelId: string, kind: BucketKind, start: Date): string {
  return `${providerId}|${modelId}|${kind}|${start.toISOString()}`;
}

/* ── reads ───────────────────────────────────────────────────────────────── */

/**
 * Returns per-(provider, kind) counters for the current day and minute.
 * Provider-level counters use modelId '' and are what most limits are set on.
 */
export async function loadCounters(
  providerIds: string[],
  now = new Date(),
): Promise<Map<string, { day: Counter; minute: Counter }>> {
  const out = new Map<string, { day: Counter; minute: Counter }>();
  const dayStart = bucketStart('day', now);
  const minuteStart = bucketStart('minute', now);

  for (const id of providerIds) {
    out.set(id, {
      day: { requests: 0, tokens: 0 },
      minute: { requests: 0, tokens: 0 },
    });
  }

  if (env.isDemo) {
    for (const [providerId, bucket] of out) {
      const dk = memKey(providerId, '', 'day', dayStart);
      const mk = memKey(providerId, '', 'minute', minuteStart);
      const d = memCounters.get(dk);
      const m = memCounters.get(mk);
      if (d) bucket.day = { ...d };
      if (m) bucket.minute = { ...m };
    }
    return out;
  }

  if (providerIds.length === 0) return out;

  const rows = await db()
    .select()
    .from(quotaBuckets)
    .where(
      and(
        inArray(quotaBuckets.providerId, providerIds),
        eq(quotaBuckets.modelId, ''),
        gte(quotaBuckets.bucketStart, dayStart),
      ),
    );

  for (const row of rows) {
    const bucket = out.get(row.providerId);
    if (!bucket) continue;
    const start = new Date(row.bucketStart).getTime();
    const target = start === dayStart.getTime() ? bucket.day : bucket.minute;
    target.requests += row.requests;
    target.tokens += Number(row.tokens);
  }
  return out;
}

export async function loadLimits(providerIds: string[]): Promise<Map<string, Limit>> {
  const out = new Map<string, Limit>();

  if (env.isDemo) {
    for (const id of providerIds) out.set(id, memLimits.get(id) ?? { maxRequests: null, maxTokens: null });
    return out;
  }
  if (providerIds.length === 0) return out;

  const rows = await db()
    .select()
    .from(quotaLimits)
    .where(and(inArray(quotaLimits.providerId, providerIds), eq(quotaLimits.modelId, '')));

  for (const row of rows) {
    if (row.bucketKind !== 'day') continue;
    out.set(row.providerId, {
      maxRequests: row.maxRequests,
      maxTokens: row.maxTokens === null ? null : Number(row.maxTokens),
    });
  }
  return out;
}

export function remaining(limit: Limit, counter: Counter): number | null {
  if (limit.maxRequests === null) return null;
  return Math.max(0, limit.maxRequests - counter.requests);
}

/** True when the provider still has either no cap or headroom under it. */
export function hasHeadroom(limit: Limit, counter: Counter): boolean {
  if (limit.maxRequests === null) return true;
  return counter.requests < limit.maxRequests;
}

/** 0..1 — how much of the daily request allowance is gone. */
export function burnRatio(limit: Limit, counter: Counter): number | null {
  if (limit.maxRequests === null || limit.maxRequests === 0) return null;
  return Math.min(1, counter.requests / limit.maxRequests);
}

/* ── writes ──────────────────────────────────────────────────────────────── */

export async function recordUsage(
  providerId: string,
  tokens: number,
  now = new Date(),
): Promise<void> {
  const dayStart = bucketStart('day', now);
  const minuteStart = bucketStart('minute', now);

  if (env.isDemo) {
    for (const [kind, start] of [
      ['day', dayStart],
      ['minute', minuteStart],
    ] as const) {
      const key = memKey(providerId, '', kind, start);
      const current = memCounters.get(key) ?? { requests: 0, tokens: 0 };
      memCounters.set(key, {
        requests: current.requests + 1,
        tokens: current.tokens + tokens,
      });
    }
    return;
  }

  const sql = db();
  await sql
    .insert(quotaBuckets)
    .values([
      { providerId, modelId: '', bucketKind: 'day', bucketStart: dayStart, requests: 1, tokens },
      { providerId, modelId: '', bucketKind: 'minute', bucketStart: minuteStart, requests: 1, tokens },
    ])
    .onConflictDoUpdate({
      target: [
        quotaBuckets.providerId,
        quotaBuckets.modelId,
        quotaBuckets.bucketKind,
        quotaBuckets.bucketStart,
      ],
      set: {
        requests: sql.$count(quotaBuckets.requests),
        tokens: sql.$count(quotaBuckets.tokens),
      },
    });
}

/** Seeds the in-memory limits. Used by the demo dataset. */
export function seedDemoLimits(entries: Array<[string, Limit]>): void {
  for (const [id, limit] of entries) memLimits.set(id, limit);
}

/** Seeds the in-memory counters from the demo dataset. */
export function seedDemoCounters(
  entries: Array<[string, number, number]>, // providerId, requests, tokens
  now = new Date(),
): void {
  const dayStart = bucketStart('day', now);
  for (const [providerId, requests, tokens] of entries) {
    memCounters.set(memKey(providerId, '', 'day', dayStart), { requests, tokens });
  }
}
