/**
 * Schema for the router. Two kinds of table live here:
 *
 *   control plane  — providers, their keys, the model catalog, quota limits, aliases
 *   data plane     — quota counters and (sampled) request logs
 *
 * Deliberate choices:
 *  - Encrypted key material is `text` holding base64, not `bytea`. The Neon HTTP
 *    driver returns bytea as a hex string, and the round-trip has bitten enough
 *    people that base64 text is the cheaper correctness.
 *  - `quota_buckets` is keyed on (provider, model, kind, bucket_start) so the hot
 *    path is a single range read across every candidate model at once.
 *  - `request_log` is sampled; it is not an audit log. Full-fidelity logging on a
 *    1 GB Neon free tier dies in weeks.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  bigint,
} from 'drizzle-orm/pg-core';

/* ── control plane ─────────────────────────────────────────────────────── */

export const providers = pgTable('providers', {
  id: text('id').primaryKey(), // 'openrouter', 'nvidia', ...
  name: text('name').notNull(),
  /** Base URL for the OpenAI-compatible surface. No trailing slash. */
  baseUrl: text('base_url').notNull(),
  /** 'openai' | 'cloudflare' — see src/providers/adapters.ts */
  adapter: text('adapter').notNull().default('openai'),
  /** Free-text note shown in the dashboard (signup URL, tier caveats). */
  note: text('note'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const providerKeys = pgTable(
  'provider_keys',
  {
    id: text('id').primaryKey(),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    /** AES-256-GCM, base64. AAD = `${providerId}:${keyVersion}`. */
    ciphertext: text('ciphertext').notNull(),
    iv: text('iv').notNull(),
    keyVersion: integer('key_version').notNull().default(1),
    /** Last four characters, for the dashboard only. Never the whole key. */
    keyHint: text('key_hint').notNull(),
    /** 'active' | 'disabled' | 'invalid' */
    status: text('status').notNull().default('active'),
    /** Least-recently-used ordering for round-robin across keys. */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('provider_keys_provider_idx').on(t.providerId, t.status)],
);

export const models = pgTable(
  'models',
  {
    id: text('id').primaryKey(), // `${providerId}:${upstreamId}`
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    /** The id the upstream expects in the request body. */
    upstreamId: text('upstream_id').notNull(),
    /** Dedup key: 'gpt-oss-120b', 'glm-5.3', 'gemma-4-31b'. */
    family: text('family').notNull(),
    displayName: text('display_name').notNull(),
    contextLen: integer('context_len'),
    supportsTools: boolean('supports_tools').notNull().default(false),
    supportsVision: boolean('supports_vision').notNull().default(false),
    supportsJson: boolean('supports_json').notNull().default(false),
    isFree: boolean('is_free').notNull().default(true),
    enabled: boolean('enabled').notNull().default(true),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  },
  (t) => [
    index('models_provider_idx').on(t.providerId),
    index('models_family_idx').on(t.family),
  ],
);

export const quotaLimits = pgTable(
  'quota_limits',
  {
    providerId: text('provider_id').notNull(),
    /** '' (not null) means the limit applies to the whole provider. */
    modelId: text('model_id').notNull().default(''),
    /** 'minute' | 'day' */
    bucketKind: text('bucket_kind').notNull(),
    maxRequests: integer('max_requests'),
    maxTokens: bigint('max_tokens', { mode: 'number' }),
  },
  (t) => [primaryKey({ columns: [t.providerId, t.modelId, t.bucketKind] })],
);

export const aliases = pgTable('aliases', {
  name: text('name').primaryKey(), // 'auto', 'fast', 'smart', 'vision'
  strategy: text('strategy').notNull().default('chain'),
  /** Ordered list of model families to try. */
  chain: jsonb('chain').notNull().$type<string[]>(),
  note: text('note'),
});

/* ── data plane ────────────────────────────────────────────────────────── */

export const quotaBuckets = pgTable(
  'quota_buckets',
  {
    providerId: text('provider_id').notNull(),
    modelId: text('model_id').notNull().default(''),
    bucketKind: text('bucket_kind').notNull(),
    bucketStart: timestamp('bucket_start', { withTimezone: true }).notNull(),
    requests: integer('requests').notNull().default(0),
    tokens: bigint('tokens', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.providerId, t.modelId, t.bucketKind, t.bucketStart] }),
    index('quota_buckets_start_idx').on(t.bucketStart),
  ],
);

export const modelHealth = pgTable(
  'model_health',
  {
    modelId: text('model_id').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    successes: integer('successes').notNull().default(0),
    failures: integer('failures').notNull().default(0),
    p95Ms: integer('p95_ms'),
    lastError: text('last_error'),
  },
  (t) => [primaryKey({ columns: [t.modelId, t.windowStart] })],
);

export const requestLog = pgTable(
  'request_log',
  {
    id: text('id').primaryKey(),
    ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
    alias: text('alias'),
    modelId: text('model_id'),
    status: integer('status').notNull(),
    latencyMs: integer('latency_ms'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    fallbacks: integer('fallbacks').notNull().default(0),
    errorCode: text('error_code'),
  },
  (t) => [index('request_log_ts_idx').on(t.ts)],
);

export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  /** SHA-256 of the client key. The key itself is shown once, at creation. */
  keyHash: text('key_hash').notNull().unique(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});
