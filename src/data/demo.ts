/**
 * The dataset the dashboard renders from.
 *
 * SAMPLE DATA — replace before you rely on it. It is written to be internally
 * consistent rather than pretty: every total on screen is derived from these
 * rows, and the assertions at the foot of the file fail loudly if they stop
 * reconciling. Real values come from `quota_buckets` and `request_log`; see
 * `loadDashboard()` in src/data/index.ts for the swap.
 *
 * Units: `used` is requests, `tokens` is tokens, `limit` is requests per UTC day,
 * `p95` is milliseconds.
 */

export interface ProviderUsage {
  id: string;
  name: string;
  /** Documented free-tier daily request ceiling. */
  limit: number;
  /** Requests consumed today. */
  used: number;
  tokens: number;
  /** Active keys on this provider. Zero means keyless. */
  keys: number;
  /** Last four characters of the active key, for the key table. Null when keyless. */
  keyHint: string | null;
  /** How long ago the active key was last rotated. */
  keyAge: string;
  models: number;
  p95: number;
  /** 429s received today, from upstream or from our own filter. */
  rateLimited: number;
  status: 'ok' | 'warn' | 'degraded' | 'off';
  /** One line of the provider's own terms, for the settings screen. */
  note: string;
}

export const PROVIDER_USAGE: ProviderUsage[] = [
  { id: 'nvidia', name: 'NVIDIA NIM', limit: 1000, used: 268, tokens: 2_940_100, keys: 2, keyHint: '9f2c', keyAge: '4d ago', models: 33, p95: 980, rateLimited: 0, status: 'ok', note: 'Catalog is public without a key; inference needs one. Dev credits, then paid.' },
  { id: 'groq', name: 'Groq', limit: 1000, used: 904, tokens: 5_211_900, keys: 1, keyHint: 'a71b', keyAge: '19d ago', models: 14, p95: 410, rateLimited: 11, status: 'warn', note: 'Caps are per model, not per account. Lowest time-to-first-token of the set.' },
  { id: 'gemini', name: 'Google AI Studio', limit: 1500, used: 377, tokens: 2_206_300, keys: 1, keyHint: '4d10', keyAge: '2d ago', models: 5, p95: 1190, rateLimited: 0, status: 'ok', note: 'Limits are per Google Cloud project; the daily count resets at midnight Pacific.' },
  { id: 'cerebras', name: 'Cerebras', limit: 900, used: 512, tokens: 3_884_000, keys: 1, keyHint: 'e6a4', keyAge: '31d ago', models: 6, p95: 520, rateLimited: 0, status: 'ok', note: 'Wafer-scale inference. Generous on tokens per day, tight on requests per minute.' },
  { id: 'cloudflare', name: 'Cloudflare Workers AI', limit: 300, used: 286, tokens: 1_402_500, keys: 1, keyHint: '77be', keyAge: '9d ago', models: 41, p95: 1620, rateLimited: 2, status: 'warn', note: '10,000 Neurons a day. Nine frontier models now require a paid method.' },
  { id: 'huggingface', name: 'HuggingFace Router', limit: 300, used: 211, tokens: 1_764_400, keys: 1, keyHint: '10cd', keyAge: '6d ago', models: 162, p95: 2310, rateLimited: 3, status: 'ok', note: 'A monthly credit allowance rather than a hard daily cap. 162 public models.' },
  { id: 'zhipu', name: 'Z.ai / Zhipu', limit: 500, used: 129, tokens: 702_400, keys: 1, keyHint: '3b8f', keyAge: '12d ago', models: 3, p95: 1740, rateLimited: 0, status: 'ok', note: 'The Flash tier is free: glm-4.5-flash, glm-4.6v-flash, glm-4.7-flash.' },
  { id: 'chutes', name: 'Chutes', limit: 200, used: 63, tokens: 388_900, keys: 1, keyHint: 'c918', keyAge: '27d ago', models: 19, p95: 2870, rateLimited: 1, status: 'ok', note: '19 public models, mostly TEE-hosted open weights. Cold starts are slow.' },
  { id: 'sambanova', name: 'SambaNova', limit: 200, used: 44, tokens: 301_200, keys: 1, keyHint: '5e27', keyAge: '3d ago', models: 5, p95: 1050, rateLimited: 0, status: 'ok', note: 'Small catalog, five models. Fast on the ones it serves.' },
  { id: 'openrouter', name: 'OpenRouter', limit: 50, used: 41, tokens: 412_800, keys: 1, keyHint: '2ad6', keyAge: 'today', models: 12, p95: 1840, rateLimited: 6, status: 'warn', note: 'Only the :free variants count against the cap. Buying 10 credits once raises it to 1,000 a day.' },
  { id: 'pollinations', name: 'Pollinations', limit: 200, used: 18, tokens: 74_100, keys: 0, keyHint: null, keyAge: 'keyless', models: 1, p95: 3240, rateLimited: 4, status: 'degraded', note: 'The only keyless endpoint left. One anonymous model: openai-fast, GPT-OSS 20B.' },
];

/** Configured but switched off — no key yet, or deliberately parked. */
export const PROVIDERS_OFF = [
  { id: 'deepinfra', name: 'DeepInfra', reason: 'No key' },
  { id: 'novita', name: 'Novita', reason: 'No key' },
  { id: 'mistral', name: 'Mistral La Plateforme', reason: 'No key' },
  { id: 'modelscope', name: 'ModelScope', reason: 'Parked: slow cold starts' },
];

/**
 * Relative request volume by UTC hour, and a different shape for tokens: the
 * early hours ran on larger models, so their token share is higher than their
 * request share. Two profiles, so switching the KPI cell actually changes the
 * chart instead of rescaling it.
 */
const REQUEST_PROFILE = [
  1.4, 0.9, 0.6, 0.5, 0.8, 1.6, 3.1, 5.4, 7.8, 9.2, 10.1, 9.6, 8.1, 9.4, 10.4, 9.8, 8.7, 6.9,
  4.8, 3.6, 2.8, 2.1, 1.7, 1.3,
];
const TOKEN_PROFILE = [
  2.1, 1.2, 0.7, 0.5, 0.9, 2.2, 4.4, 7.1, 9.4, 10.2, 10.6, 9.1, 7.2, 8.4, 9.9, 10.3, 8.1, 5.9,
  3.9, 2.6, 1.9, 1.4, 1.1, 0.8,
];

/** Largest-remainder apportionment: integers that sum exactly to `total`. */
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / sum) * total);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < order.length && remainder > 0; i++, remainder--) {
    floors[order[i].index] += 1;
  }
  return floors;
}

export const REQUESTS_TODAY = PROVIDER_USAGE.reduce((a, p) => a + p.used, 0);
export const TOKENS_TODAY = PROVIDER_USAGE.reduce((a, p) => a + p.tokens, 0);
export const CAPACITY_TODAY = PROVIDER_USAGE.reduce((a, p) => a + p.limit, 0);
export const RATE_LIMITED_TODAY = PROVIDER_USAGE.reduce((a, p) => a + p.rateLimited, 0);
export const PROVIDERS_LIVE = PROVIDER_USAGE.length;

/** Requests per hour, UTC. The day is not over: hours after the current one are zero. */
export const NOW = new Date();
export const CURRENT_HOUR = NOW.getUTCHours();

function byHour(total: number, profile: number[]): number[] {
  const elapsed = apportion(total, profile.slice(0, CURRENT_HOUR + 1));
  const pad = Array.from({ length: 24 - elapsed.length }, () => 0);
  return [...elapsed, ...pad];
}

export const HOURLY = byHour(REQUESTS_TODAY, REQUEST_PROFILE);
export const HOURLY_TOKENS = byHour(TOKENS_TODAY, TOKEN_PROFILE);

export const HOUR_LABELS = Array.from(
  { length: 24 },
  (_, h) => `${String(h).padStart(2, '0')}:00`,
);

/** "20 Nov · 21:48 UTC" — the stamp in a page head. */
export function utcStamp(when = NOW): string {
  const day = when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${day} · ${when.toISOString().slice(11, 16)} UTC`;
}

/** "Thursday 20 November 2026" — the date line over a table. */
export function utcDateLong(when = NOW): string {
  return when.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Request-weighted latency across every provider that served something. */
export const WEIGHTED_P95 = Math.round(
  PROVIDER_USAGE.reduce((a, p) => a + p.p95 * p.used, 0) / Math.max(1, REQUESTS_TODAY),
);

/* ── models ──────────────────────────────────────────────────────────────── */

export interface ModelRow {
  family: string;
  /** Providers serving this family free, in preference order. */
  providers: string[];
  contextK: number;
  tools: boolean;
  vision: boolean;
  /** Requests served today across all providers. */
  served: number;
}

export const MODEL_ROWS: ModelRow[] = [
  { family: 'gpt-oss-120b',            providers: ['sambanova', 'cloudflare', 'huggingface', 'chutes', 'cerebras'], contextK: 131,  tools: true,  vision: false, served: 486 },
  { family: 'glm-5.3',                 providers: ['nvidia', 'zhipu', 'chutes', 'huggingface'],                    contextK: 1000, tools: true,  vision: false, served: 341 },
  { family: 'qwen3.8-27b',             providers: ['huggingface', 'chutes', 'nvidia'],                            contextK: 262,  tools: true,  vision: false, served: 302 },
  { family: 'gemma-4-31b-it',          providers: ['nvidia', 'huggingface', 'sambanova', 'openrouter'],           contextK: 262,  tools: false, vision: true,  served: 264 },
  { family: 'nemotron-3.5-lightning',  providers: ['nvidia', 'openrouter'],                                       contextK: 1000, tools: true,  vision: false, served: 218 },
  { family: 'kimi-k3.1-pro',           providers: ['nvidia', 'chutes', 'huggingface'],                            contextK: 262,  tools: true,  vision: false, served: 191 },
  { family: 'deepseek-v4.1-flash',     providers: ['cloudflare', 'chutes', 'huggingface'],                        contextK: 1000, tools: true,  vision: false, served: 176 },
  { family: 'llama-3.3-70b',           providers: ['sambanova', 'cloudflare', 'groq'],                            contextK: 131,  tools: true,  vision: false, served: 158 },
  { family: 'openai-fast',             providers: ['pollinations'],                                               contextK: 131,  tools: true,  vision: false, served: 77 },
  { family: 'glm-4.7-flash',           providers: ['zhipu'],                                                      contextK: 200,  tools: true,  vision: false, served: 64 },
  { family: 'qwen3-30b-a3b',           providers: ['nvidia', 'huggingface'],                                      contextK: 262,  tools: true,  vision: false, served: 52 },
  { family: 'gemini-3.5-flash-lite',   providers: ['gemini'],                                                     contextK: 1000, tools: true,  vision: true,  served: 48 },
];

export const MODEL_FAMILIES = MODEL_ROWS.length;
export const MODEL_ENDPOINTS = MODEL_ROWS.reduce((a, m) => a + m.providers.length, 0);
export const MODEL_SERVED = MODEL_ROWS.reduce((a, m) => a + m.served, 0);
export const MODEL_LONGEST = Math.max(...MODEL_ROWS.map((m) => m.contextK));

/* ── recent requests ─────────────────────────────────────────────────────── */

export interface RequestRow {
  id: string;
  /** Minutes before now. */
  minutesAgo: number;
  family: string;
  provider: string;
  status: number;
  ms: number;
  tokens: number;
  fallbacks: number;
}

export const RECENT_REQUESTS: RequestRow[] = [
  { id: 'a4f19c02b7d3', minutesAgo: 0,  family: 'gpt-oss-120b',        provider: 'sambanova',   status: 200, ms: 812,  tokens: 1_204, fallbacks: 0 },
  { id: '8c21e5a90f47', minutesAgo: 1,  family: 'glm-5.3',             provider: 'nvidia',      status: 200, ms: 1_340, tokens: 2_318, fallbacks: 0 },
  { id: 'f30b7d4e12a8', minutesAgo: 2,  family: 'qwen3.8-27b',         provider: 'huggingface', status: 200, ms: 2_104, tokens: 986,  fallbacks: 1 },
  { id: '1d8a3f60c95e', minutesAgo: 4,  family: 'llama-3.3-70b',       provider: 'groq',        status: 429, ms: 156,  tokens: 0,    fallbacks: 0 },
  { id: '6e02b9c47af1', minutesAgo: 5,  family: 'gemma-4-31b-it',      provider: 'nvidia',      status: 200, ms: 1_902, tokens: 3_441, fallbacks: 0 },
  { id: 'c57f18d3a260', minutesAgo: 7,  family: 'deepseek-v4.1-flash', provider: 'cloudflare',  status: 200, ms: 1_488, tokens: 1_672, fallbacks: 2 },
  { id: '9b4e6a02d817', minutesAgo: 9,  family: 'kimi-k3.1-pro',       provider: 'chutes',      status: 200, ms: 2_766, tokens: 4_019, fallbacks: 1 },
  { id: '2f7c90b5e13a', minutesAgo: 12, family: 'openai-fast',         provider: 'pollinations',status: 200, ms: 3_120, tokens: 742,  fallbacks: 3 },
];

/* ── the fallback chain behind the `auto` alias ──────────────────────────── */

export interface ChainNode {
  provider: string;
  family: string;
  /** Remaining requests today on this provider. */
  left: number;
  /** 'live' | 'exhausted' | 'cooling' */
  state: 'live' | 'exhausted' | 'cooling';
}

export const AUTO_CHAIN: ChainNode[] = [
  { provider: 'nvidia',       family: 'gpt-oss-120b',   left: 732, state: 'live' },
  { provider: 'sambanova',    family: 'gpt-oss-120b',   left: 156, state: 'live' },
  { provider: 'cerebras',     family: 'gpt-oss-120b',   left: 388, state: 'live' },
  { provider: 'groq',         family: 'llama-3.3-70b',  left: 96,  state: 'live' },
  { provider: 'cloudflare',   family: 'gpt-oss-120b',   left: 14,  state: 'cooling' },
  { provider: 'openrouter',   family: 'gemma-4-31b-it', left: 9,   state: 'cooling' },
  { provider: 'huggingface',  family: 'glm-5.3',        left: 89,  state: 'live' },
  { provider: 'pollinations', family: 'openai-fast',    left: 0,   state: 'exhausted' },
];

export const CHAIN_TOTAL = AUTO_CHAIN.reduce((a, n) => a + n.left, 0);
export const CHAIN_LIVE = AUTO_CHAIN.filter((n) => n.state === 'live').length;

/* ── helpers the screens use ─────────────────────────────────────────────── */

/** 0..1 of the daily request allowance consumed. */
export const burn = (p: ProviderUsage): number => (p.limit === 0 ? 0 : p.used / p.limit);

/** Providers closest to their ceiling, worst first. */
export const NEAR_CAP = [...PROVIDER_USAGE].sort((a, b) => burn(b) - burn(a)).slice(0, 6);

export const NAME_BY_ID = new Map(PROVIDER_USAGE.map((p) => [p.id, p.name]));

export function providerName(id: string): string {
  return NAME_BY_ID.get(id) ?? id;
}

/** 2,853 → "2,853"; 19,288,600 → "19.3M". Compact above a million. */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return n.toLocaleString('en-US');
}

export function thousands(n: number): string {
  return n.toLocaleString('en-US');
}

/* ── assertions: the screen must not be able to lie ──────────────────────── */

const hourlySum = HOURLY.reduce((a, b) => a + b, 0);
console.assert(hourlySum === REQUESTS_TODAY, `hourly ${hourlySum} != provider total ${REQUESTS_TODAY}`);
console.assert(
  HOURLY_TOKENS.reduce((a, b) => a + b, 0) === TOKENS_TODAY,
  'token series does not sum to the provider token total',
);
console.assert(
  HOURLY.slice(CURRENT_HOUR + 1).every((v) => v === 0),
  'hours after the current one must be zero — the day has not happened yet',
);
console.assert(
  CAPACITY_TODAY >= REQUESTS_TODAY,
  `capacity ${CAPACITY_TODAY} below usage ${REQUESTS_TODAY}`,
);
console.assert(
  MODEL_ROWS.every((m) => m.providers.every((p) => PROVIDER_USAGE.some((u) => u.id === p))),
  'a model row references a provider that is not in PROVIDER_USAGE',
);
console.assert(MODEL_SERVED <= REQUESTS_TODAY, 'model rows claim more traffic than the day total');
console.assert(CHAIN_TOTAL === 1484, `chain remaining ${CHAIN_TOTAL} does not match the stated 1,484`);
console.assert(
  AUTO_CHAIN.every((n) => n.left >= 0),
  'a chain node has negative remaining quota',
);
