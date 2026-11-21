/**
 * Live dashboard loader.
 *
 * Every screen derives its numbers from Neon when `DATABASE_URL` is set. When
 * the database is absent the loader returns the demo dataset so local
 * development still works without a connection.
 */
import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import {
  aliases,
  modelHealth,
  models,
  providers,
  providerKeys,
  quotaBuckets,
  quotaLimits,
  requestLog,
} from '../db/schema.ts';
import { env } from '../env.ts';
import {
  AUTO_CHAIN,
  CAPACITY_TODAY,
  CHAIN_LIVE,
  CHAIN_TOTAL,
  CURRENT_HOUR,
  HOURLY,
  HOURLY_TOKENS,
  HOUR_LABELS,
  MODEL_ENDPOINTS,
  MODEL_FAMILIES,
  MODEL_LONGEST,
  MODEL_ROWS,
  MODEL_SERVED,
  NEAR_CAP,
  PROVIDERS_LIVE,
  PROVIDERS_OFF,
  PROVIDER_USAGE,
  RATE_LIMITED_TODAY,
  RECENT_REQUESTS,
  REQUESTS_TODAY,
  TOKENS_TODAY,
  WEIGHTED_P95,
  type ChainNode,
  type ModelRow,
  type ProviderUsage,
  type RequestRow,
} from './demo.ts';

export interface DashboardData {
  live: boolean;
  usage: ProviderUsage[];
  off: typeof PROVIDERS_OFF;
  models: ModelRow[];
  requests: RequestRow[];
  chain: ChainNode[];
  requestsToday: number;
  tokensToday: number;
  capacityToday: number;
  rateLimitedToday: number;
  providersLive: number;
  currentHour: number;
  hourly: number[];
  hourlyTokens: number[];
  hourLabels: string[];
  weightedP95: number;
  modelFamilies: number;
  modelEndpoints: number;
  modelServed: number;
  modelLongest: number;
  chainTotal: number;
  chainLive: number;
  nearCap: ProviderUsage[];
}

function bucketStart(kind: 'minute' | 'day', now = new Date()): Date {
  const d = new Date(now);
  if (kind === 'minute') {
    d.setUTCSeconds(0, 0);
    return d;
  }
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function demo(): DashboardData {
  return {
    live: false,
    usage: PROVIDER_USAGE,
    off: PROVIDERS_OFF,
    models: MODEL_ROWS,
    requests: RECENT_REQUESTS,
    chain: AUTO_CHAIN,
    requestsToday: REQUESTS_TODAY,
    tokensToday: TOKENS_TODAY,
    capacityToday: CAPACITY_TODAY,
    rateLimitedToday: RATE_LIMITED_TODAY,
    providersLive: PROVIDERS_LIVE,
    currentHour: CURRENT_HOUR,
    hourly: HOURLY,
    hourlyTokens: HOURLY_TOKENS,
    hourLabels: HOUR_LABELS,
    weightedP95: WEIGHTED_P95,
    modelFamilies: MODEL_FAMILIES,
    modelEndpoints: MODEL_ENDPOINTS,
    modelServed: MODEL_SERVED,
    modelLongest: MODEL_LONGEST,
    chainTotal: CHAIN_TOTAL,
    chainLive: CHAIN_LIVE,
    nearCap: NEAR_CAP,
  };
}

export async function loadDashboard(): Promise<DashboardData> {
  if (env.isDemo) return demo();

  const dayStart = bucketStart('day');
  const now = new Date();
  const currentHour = now.getUTCHours();

  const providerRows = await db().select().from(providers).where(eq(providers.enabled, true));
  const providerIds = providerRows.map((row) => row.id);

  const [
    counterRows,
    limitRows,
    keyRows,
    healthRows,
    logRows,
    modelRows,
    quotaToday,
    rateLimitedRows,
    aliasRows,
  ] = await Promise.all([
    db()
      .select({
        providerId: quotaBuckets.providerId,
        requests: sql<number>`sum(${quotaBuckets.requests})`,
        tokens: sql<number>`sum(${quotaBuckets.tokens})`,
      })
      .from(quotaBuckets)
      .where(and(inArray(quotaBuckets.providerId, providerIds), eq(quotaBuckets.modelId, ''), gte(quotaBuckets.bucketStart, dayStart)))
      .groupBy(quotaBuckets.providerId),
    db()
      .select({ providerId: quotaLimits.providerId, maxRequests: quotaLimits.maxRequests })
      .from(quotaLimits)
      .where(and(inArray(quotaLimits.providerId, providerIds), eq(quotaLimits.modelId, ''), eq(quotaLimits.bucketKind, 'day'))),
    db()
      .select({ providerId: providerKeys.providerId, keys: count(), keyHint: providerKeys.keyHint, lastUsedAt: providerKeys.lastUsedAt })
      .from(providerKeys)
      .where(and(inArray(providerKeys.providerId, providerIds), eq(providerKeys.status, 'active')))
      .groupBy(providerKeys.providerId, providerKeys.keyHint, providerKeys.lastUsedAt),
    db()
      .select({ modelId: modelHealth.modelId, p95Ms: sql<number>`avg(${modelHealth.p95Ms})` })
      .from(modelHealth)
      .where(gte(modelHealth.windowStart, dayStart))
      .groupBy(modelHealth.modelId),
    db()
      .select({
        id: requestLog.id,
        ts: requestLog.ts,
        alias: requestLog.alias,
        modelId: requestLog.modelId,
        status: requestLog.status,
        latencyMs: requestLog.latencyMs,
        promptTokens: requestLog.promptTokens,
        completionTokens: requestLog.completionTokens,
        fallbacks: requestLog.fallbacks,
      })
      .from(requestLog)
      .where(gte(requestLog.ts, dayStart))
      .orderBy(desc(requestLog.ts))
      .limit(12),
    db()
      .select({
        family: models.family,
        providerId: models.providerId,
        contextK: models.contextLen,
        tools: models.supportsTools,
        vision: models.supportsVision,
        served: sql<number>`coalesce((
          select sum(${quotaBuckets.requests})
          from ${quotaBuckets}
          where ${quotaBuckets.providerId} = ${models.providerId}
            and ${quotaBuckets.modelId} = ${models.family}
            and ${quotaBuckets.bucketKind} = 'day'
            and ${quotaBuckets.bucketStart} >= ${dayStart}
        ), 0)`,
      })
      .from(models)
      .where(eq(models.enabled, true)),
    db()
      .select({
        hour: sql<number>`extract(hour from ${quotaBuckets.bucketStart})`,
        requests: sql<number>`sum(${quotaBuckets.requests})`,
        tokens: sql<number>`sum(${quotaBuckets.tokens})`,
      })
      .from(quotaBuckets)
      .where(gte(quotaBuckets.bucketStart, dayStart))
      .groupBy(sql`extract(hour from ${quotaBuckets.bucketStart})`),
    db()
      .select({ value: sql<number>`count(*)` })
      .from(requestLog)
      .where(and(gte(requestLog.ts, dayStart), eq(requestLog.status, 429))),
    db().select().from(aliases).where(eq(aliases.name, 'auto')).limit(1),
  ]);

  const counterMap = new Map(counterRows.map((row) => [row.providerId, { requests: toNumber(row.requests), tokens: toNumber(row.tokens) }]));
  const limitMap = new Map(limitRows.map((row) => [row.providerId, row.maxRequests ?? null]));
  const keyMap = new Map<string, { keys: number; keyHint: string | null; age: string }>();
  for (const row of keyRows) {
    const age = row.lastUsedAt
      ? `${Math.max(1, Math.round((Date.now() - new Date(row.lastUsedAt).getTime()) / 86400000))}d ago`
      : 'today';
    keyMap.set(row.providerId, { keys: toNumber(row.keys), keyHint: row.keyHint ?? null, age });
  }
  const p95Map = new Map<string, number>();
  for (const row of healthRows) {
    const providerId = row.modelId.split('/')[0];
    if (!p95Map.has(providerId)) p95Map.set(providerId, toNumber(row.p95Ms));
  }

  const logStats = new Map<string, { requests: number; rateLimited: number }>();
  for (const row of logRows) {
    const providerId = row.alias ?? row.modelId?.split('/')[0] ?? 'router';
    const current = logStats.get(providerId) ?? { requests: 0, rateLimited: 0 };
    current.requests += 1;
    if (row.status === 429) current.rateLimited += 1;
    logStats.set(providerId, current);
  }

  const usage: ProviderUsage[] = providerRows.map((provider) => {
    const counter = counterMap.get(provider.id) ?? { requests: 0, tokens: 0 };
    const limit = limitMap.get(provider.id) ?? null;
    const keyInfo = keyMap.get(provider.id) ?? { keys: 0, keyHint: null, age: 'no key' };
    const stats = logStats.get(provider.id) ?? { requests: 0, rateLimited: 0 };
    const used = counter.requests;
    const status: ProviderUsage['status'] =
      stats.rateLimited > 0
        ? 'degraded'
        : limit !== null && limit > 0 && used / limit >= 0.8
          ? 'warn'
          : keyInfo.keys === 0 && !provider.note?.toLowerCase().includes('keyless')
            ? 'off'
            : 'ok';
    return {
      id: provider.id,
      name: provider.name,
      limit: limit ?? 0,
      used,
      tokens: counter.tokens,
      keys: keyInfo.keys,
      keyHint: keyInfo.keyHint,
      keyAge: keyInfo.age,
      models: 0,
      p95: Math.round(p95Map.get(provider.id) ?? 0),
      rateLimited: stats.rateLimited,
      status,
      note: provider.note ?? '',
    };
  });

  const familyMap = new Map<string, { providers: Set<string>; contextK: number; tools: boolean; vision: boolean; served: number }>();
  for (const row of modelRows) {
    const current = familyMap.get(row.family) ?? { providers: new Set<string>(), contextK: 0, tools: false, vision: false, served: 0 };
    current.providers.add(row.providerId);
    current.served += toNumber(row.served);
    current.tools = current.tools || row.tools;
    current.vision = current.vision || row.vision;
    if ((row.contextK ?? 0) > current.contextK) current.contextK = row.contextK ?? 0;
    familyMap.set(row.family, current);
  }
  const liveModels: ModelRow[] = Array.from(familyMap.entries())
    .map(([family, data]) => ({
      family,
      providers: Array.from(data.providers),
      contextK: data.contextK,
      tools: data.tools,
      vision: data.vision,
      served: data.served,
    }))
    .sort((a, b) => b.served - a.served);

  const requests: RequestRow[] = logRows.map((row, index) => ({
    id: row.id,
    minutesAgo: Math.max(0, Math.round((now.getTime() - new Date(row.ts).getTime()) / 60000)),
    family: row.alias ?? row.modelId?.split('/').slice(1).join('/') ?? 'unknown',
    provider: row.modelId?.split('/')[0] ?? row.alias ?? 'router',
    status: row.status,
    ms: row.latencyMs ?? 0,
    tokens: toNumber(row.promptTokens) + toNumber(row.completionTokens),
    fallbacks: row.fallbacks ?? 0,
  }));

  const hourly = new Array(24).fill(0);
  const hourlyTokens = new Array(24).fill(0);
  for (const row of quotaToday) {
    const hour = Math.min(23, Math.max(0, Math.round(toNumber(row.hour))));
    hourly[hour] = toNumber(row.requests);
    hourlyTokens[hour] = toNumber(row.tokens);
  }

  const requestsToday = counterRows.reduce((a, r) => a + toNumber(r.requests), 0);
  const tokensToday = counterRows.reduce((a, r) => a + toNumber(r.tokens), 0);
  const capacityToday = limitRows.reduce((a, r) => a + (r.maxRequests ?? 0), 0);
  const rateLimitedToday = toNumber(rateLimitedRows[0]?.value);
  const weightedP95 = p95Map.size > 0 ? Math.round(Array.from(p95Map.values()).reduce((a, b) => a + b, 0) / p95Map.size) : 0;

  const chainSource = aliasRows[0]?.chain ?? [];
  const chainCounters = new Map(counterRows.map((row) => [row.providerId, toNumber(row.requests)]));
  const chain: ChainNode[] = chainSource.map((entry) => {
    const [providerId, family] = entry.split('/');
    const limit = limitMap.get(providerId) ?? null;
    const counter = chainCounters.get(providerId) ?? 0;
    const left = limit !== null ? Math.max(0, limit - counter) : counter;
    const state: ChainNode['state'] =
      limit !== null && counter >= limit ? 'exhausted' : limit !== null && left <= 20 ? 'cooling' : 'live';
    return { provider: providerId, family, left, state };
  });

  const nearCap = [...usage].sort((a, b) => (a.limit === 0 ? 0 : a.used / a.limit) < (b.limit === 0 ? 0 : b.used / b.limit) ? 0 : -1).slice(0, 6);

  return {
    live: true,
    usage,
    off: PROVIDERS_OFF,
    models: liveModels,
    requests,
    chain,
    requestsToday,
    tokensToday,
    capacityToday,
    rateLimitedToday,
    providersLive: providerRows.length,
    currentHour,
    hourly,
    hourlyTokens,
    hourLabels: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`),
    weightedP95,
    modelFamilies: liveModels.length,
    modelEndpoints: liveModels.reduce((a, m) => a + m.providers.length, 0),
    modelServed: liveModels.reduce((a, m) => a + m.served, 0),
    modelLongest: liveModels.reduce((a, m) => Math.max(a, m.contextK), 0),
    chainTotal: chain.reduce((a, n) => a + n.left, 0),
    chainLive: chain.filter((n) => n.state === 'live').length,
    nearCap,
  };
}