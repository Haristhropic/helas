/**
 * The router core: resolve a requested model to an ordered list of upstream
 * candidates, then walk that list until one answers.
 *
 * The one structural constraint that shapes everything here: **fallback only
 * works before the first byte reaches the client.** Once a stream has started we
 * own the response — there is no second chance. So the entire try/retry loop lives
 * before we hand a body back, and `fetch` resolving with headers is the point of
 * commitment.
 */
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { models, providerKeys } from '../db/schema.ts';
import { env } from '../env.ts';
import { openKeyCached } from '../crypto/keys.ts';
import { PROVIDERS_BY_ID, type ProviderDef } from '../providers/catalog.ts';
import { callChatCompletions, isRetryable, type UpstreamResult } from '../providers/adapters.ts';
import {
  hasHeadroom,
  loadCounters,
  loadLimits,
  remaining,
  type Counter,
  type Limit,
} from '../quota/buckets.ts';
import { AUTO_CHAIN, MODEL_ROWS, PROVIDER_USAGE } from '../data/demo.ts';
import { ZERO_MIX_CHAIN } from '../data/zeroCostModels.ts';

export interface Candidate {
  providerId: string;
  provider: ProviderDef;
  /** The canonical family name, for the response body and the health table. */
  family: string;
  /** What the upstream expects in `body.model`. */
  upstreamId: string;
  /** Remaining requests today, or null when the provider publishes no cap. */
  left: number | null;
}

export interface RouteSuccess {
  ok: true;
  response: Response;
  candidate: Candidate;
  fallbacks: number;
  attempts: Attempt[];
}

export interface RouteFailure {
  ok: false;
  status: number;
  code: string;
  detail: string;
  attempts: Attempt[];
}

export interface Attempt {
  providerId: string;
  family: string;
  status: number;
  code: string;
  ms: number;
}

export type RouteResult = RouteSuccess | RouteFailure;

/* ── key resolution ──────────────────────────────────────────────────────── */

const ENV_KEY_NAMES: Record<string, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  nvidia: 'NVIDIA_API_KEY',
  huggingface: 'HF_TOKEN',
  chutes: 'CHUTES_API_KEY',
  sambanova: 'SAMBANOVA_API_KEY',
  groq: 'GROQ_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  gemini: 'GEMINI_API_KEY',
  cloudflare: 'CLOUDFLARE_API_TOKEN',
  deepinfra: 'DEEPINFRA_API_KEY',
  novita: 'NOVITA_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  zhipu: 'ZHIPU_API_KEY',
  modelscope: 'MODELSCOPE_API_KEY',
  tiprouter: 'TIPROUTER_API_KEY',
};

/**
 * Least-recently-used key first, so N keys on one provider behave like N times
 * the quota. Falls back to an env var, which is how you get running before the
 * database has any keys in it.
 */
async function pickKey(providerId: string): Promise<string | null> {
  if (PROVIDERS_BY_ID.get(providerId)?.keyless) return null;

  if (!env.isDemo) {
    const rows = await db()
      .select()
      .from(providerKeys)
      .where(and(eq(providerKeys.providerId, providerId), eq(providerKeys.status, 'active')))
      .orderBy(asc(providerKeys.lastUsedAt))
      .limit(1);

    if (rows.length > 0) {
      return openKeyCached({
        id: rows[0].id,
        ciphertext: rows[0].ciphertext,
        iv: rows[0].iv,
        keyVersion: rows[0].keyVersion,
        providerId,
      });
    }
  }

  const envName = ENV_KEY_NAMES[providerId];
  const value = envName ? process.env[envName]?.trim() : '';
  return value || null;
}

/* ── candidate resolution ────────────────────────────────────────────────── */

interface RawCandidate {
  providerId: string;
  family: string;
  upstreamId: string;
}

/** The families an alias stands for, best first. */
const ALIAS_CHAINS: Record<string, string[]> = {
  auto: AUTO_CHAIN.map((n) => `${n.provider}/${n.family}`),
  all: ZERO_MIX_CHAIN,
  fast: ['groq/llama-3.3-70b', 'cerebras/gpt-oss-120b', 'nvidia/gemma-4-31b-it'],
  smart: ['nvidia/glm-5.3', 'chutes/kimi-k3.1-pro', 'huggingface/qwen3.8-27b'],
  vision: ['nvidia/gemma-4-31b-it', 'gemini/gemini-3.5-flash-lite'],
  tiptip: [
    'tiprouter/qwen3.8-flash',
    'tiprouter/mimo-v2.6.flash',
    'tiprouter/step-3.7-flash',
    'tiprouter/qwen3.8-flash-uncen',
    'tiprouter/deepseek-v4.1-flash-1017-uncen',
    'tiprouter/nemotron-3.5-super',
    'tiprouter/deepseek-v-4.1-flash-1017',
    'tiprouter/deepseek-v4.1-flash-1017',
    'tiprouter/gpt-6-luna',
    'tiprouter/qwen-3.8-27b',
    'tiprouter/dots-3-note-preview',
    'tiprouter/deepseek-v4-flash-0731',
    'tiprouter/solar-mini4',
    'tiprouter/qwen4-max',
  ],
};

function fromDemoTable(requested: string): RawCandidate[] {
  const alias = ALIAS_CHAINS[requested];
  if (alias) {
    return alias
      .map((entry) => {
        const [providerId, family] = entry.split('/');
        return { providerId, family, upstreamId: family };
      })
      .filter((c) => PROVIDERS_BY_ID.has(c.providerId));
  }

  // `provider/model` addresses one upstream directly.
  if (requested.includes('/')) {
    const [providerId, ...rest] = requested.split('/');
    const family = rest.join('/');
    if (PROVIDERS_BY_ID.has(providerId)) return [{ providerId, family, upstreamId: family }];
  }

  // A bare family fans out to every provider that serves it.
  const row = MODEL_ROWS.find((m) => m.family === requested);
  if (row) {
    return row.providers.map((providerId) => ({ providerId, family: row.family, upstreamId: row.family }));
  }
  return [];
}

async function resolveRaw(requested: string): Promise<RawCandidate[]> {
  if (env.isDemo) return fromDemoTable(requested);

  const aliasChain = ALIAS_CHAINS[requested];
  if (aliasChain) {
    return aliasChain
      .map((entry) => {
        const [providerId, family] = entry.split('/');
        return { providerId, family, upstreamId: family };
      })
      .filter((c) => PROVIDERS_BY_ID.has(c.providerId));
  }

  if (requested.includes('/')) {
    const [providerId, ...rest] = requested.split('/');
    const upstreamId = rest.join('/');
    const rows = await db()
      .select()
      .from(models)
      .where(and(eq(models.providerId, providerId), eq(models.upstreamId, upstreamId), eq(models.enabled, true)))
      .limit(1);
    if (rows.length > 0) {
      return [{ providerId, family: rows[0].family, upstreamId }];
    }
  }

  const rows = await db()
    .select()
    .from(models)
    .where(and(eq(models.family, requested), eq(models.enabled, true)));
  return rows.map((row) => ({
    providerId: row.providerId,
    family: row.family,
    upstreamId: row.upstreamId,
  }));
}

const DEMO_P95 = new Map(PROVIDER_USAGE.map((p) => [p.id, p.p95]));
const DEMO_LEFT = new Map(AUTO_CHAIN.map((n) => [n.provider, n.left]));

/**
 * Order: most remaining headroom first, then lowest p95. A provider with no cap
 * sorts above one with a small cap — an uncapped free tier is the better bet.
 */
export async function resolveCandidates(requested: string): Promise<Candidate[]> {
  const raw = await resolveRaw(requested);
  if (raw.length === 0) return [];

  const providerIds = [...new Set(raw.map((c) => c.providerId))];
  const counters = await loadCounters(providerIds);
  const limits = await loadLimits(providerIds);

  const built: Candidate[] = raw
    .map((c) => {
      const provider = PROVIDERS_BY_ID.get(c.providerId);
      if (!provider) return null;
      const limit: Limit = limits.get(c.providerId) ?? {
        maxRequests: env.isDemo
          ? (PROVIDER_USAGE.find((p) => p.id === c.providerId)?.limit ?? null)
          : null,
        maxTokens: null,
      };
      const counter: Counter = counters.get(c.providerId)?.day ?? { requests: 0, tokens: 0 };
      return {
        providerId: c.providerId,
        provider,
        family: c.family,
        upstreamId: c.upstreamId,
        left: remaining(limit, counter),
      };
    })
    .filter((c): c is Candidate => c !== null);

  const headroom =
    env.isDemo || limits.size > 0
      ? built.filter((c) => {
          const limit = limits.get(c.providerId) ?? {
            maxRequests: PROVIDER_USAGE.find((p) => p.id === c.providerId)?.limit ?? null,
            maxTokens: null,
          };
          const counter = counters.get(c.providerId)?.day ?? { requests: 0, tokens: 0 };
          return hasHeadroom(limit, counter);
        })
      : built;

  const pool = headroom.length > 0 ? headroom : built;

  return pool.sort((a, b) => {
    const aLeft = a.left ?? Number.MAX_SAFE_INTEGER;
    const bLeft = b.left ?? Number.MAX_SAFE_INTEGER;
    if (aLeft !== bLeft) return bLeft - aLeft;
    const aP95 = DEMO_P95.get(a.providerId) ?? 1000;
    const bP95 = DEMO_P95.get(b.providerId) ?? 1000;
    return aP95 - bP95;
  });
}

/* ── the walk ────────────────────────────────────────────────────────────── */

export async function routeChat(rawBody: any, signal: AbortSignal): Promise<RouteResult> {
  const requested: string = typeof rawBody?.model === 'string' ? rawBody.model : 'auto';
  const candidates = await resolveCandidates(requested);
  const attempts: Attempt[] = [];

  if (candidates.length === 0) {
    return {
      ok: false,
      status: 404,
      code: 'model_not_found',
      detail: `No enabled provider serves "${requested}".`,
      attempts,
    };
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  let last: Attempt | null = null;

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const started = Date.now();

    let apiKey: string | null;
    try {
      apiKey = await pickKey(candidate.providerId);
    } catch (err) {
      attempts.push({
        providerId: candidate.providerId,
        family: candidate.family,
        status: 500,
        code: 'key_unavailable',
        ms: Date.now() - started,
      });
      continue;
    }

    if (!apiKey && !candidate.provider.keyless) {
      attempts.push({
        providerId: candidate.providerId,
        family: candidate.family,
        status: 401,
        code: 'no_key',
        ms: Date.now() - started,
      });
      continue;
    }

    const upstreamBody = {
      ...rawBody,
      model: candidate.upstreamId,
      // Ask for usage in the trailing SSE frame so accounting does not guess.
      stream_options: rawBody?.stream ? { include_usage: true } : undefined,
    };

    const result: UpstreamResult = await callChatCompletions({
      provider: candidate.provider,
      apiKey,
      body: upstreamBody,
      accountId,
      signal,
    });

    const ms = Date.now() - started;

    if (result.ok) {
      attempts.push({
        providerId: candidate.providerId,
        family: candidate.family,
        status: 200,
        code: 'ok',
        ms,
      });
      return {
        ok: true,
        response: result.response,
        candidate,
        fallbacks: index,
        attempts,
      };
    }

    last = {
      providerId: candidate.providerId,
      family: candidate.family,
      status: result.status,
      code: result.code,
      ms,
    };
    attempts.push(last);

    // A malformed body is our fault; retrying it elsewhere just multiplies 400s.
    if (!isRetryable(result.status)) break;
  }

  return {
    ok: false,
    status: last?.status ?? 503,
    code: last?.code ?? 'no_candidate',
    detail: `All ${attempts.length} candidate(s) failed. Last: ${last?.providerId ?? 'none'} ${last?.code ?? ''}`,
    attempts,
  };
}
