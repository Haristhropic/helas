var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/env.ts
var env;
var init_env = __esm({
  "src/env.ts"() {
    "use strict";
    env = {
      get databaseUrl() {
        return process.env.DATABASE_URL?.trim() || "";
      },
      /** True when no Neon connection string is configured. */
      get isDemo() {
        return !this.databaseUrl;
      },
      get masterKey() {
        return process.env.KEY_ENC_MASTER?.trim() || "";
      },
      get routerKey() {
        return process.env.ROUTER_KEY?.trim() || "";
      },
      get dashboardPassword() {
        return process.env.DASHBOARD_PASSWORD?.trim() || "";
      },
      get sessionSecret() {
        return process.env.SESSION_SECRET?.trim() || "";
      }
    };
  }
});

// src/crypto/keys.ts
var keys_exports = {};
__export(keys_exports, {
  clearKeyCache: () => clearKeyCache,
  forgetKey: () => forgetKey,
  generateApiKey: () => generateApiKey,
  generateId: () => generateId,
  hashApiKey: () => hashApiKey,
  openKey: () => openKey,
  openKeyCached: () => openKeyCached,
  sealKey: () => sealKey
});
function b64encode(bytes2) {
  return Buffer.from(bytes2).toString("base64");
}
function bytes(n) {
  return new Uint8Array(new ArrayBuffer(n));
}
function utf8(text2) {
  const encoded = new TextEncoder().encode(text2);
  const out = bytes(encoded.length);
  out.set(encoded);
  return out;
}
function b64decode(text2) {
  const src = Buffer.from(text2, "base64");
  const out = bytes(src.byteLength);
  out.set(src);
  return out;
}
async function masterKey() {
  if (cachedMaster) return cachedMaster;
  const raw5 = env.masterKey;
  if (!raw5) {
    throw new Error(
      `KEY_ENC_MASTER is not set. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  const bytes2 = b64decode(raw5);
  if (bytes2.length !== 32) {
    throw new Error(`KEY_ENC_MASTER must decode to 32 bytes, got ${bytes2.length}`);
  }
  cachedMaster = await crypto.subtle.importKey("raw", bytes2, { name: ALGO }, false, [
    "encrypt",
    "decrypt"
  ]);
  return cachedMaster;
}
function aad(providerId, keyVersion) {
  return utf8(`${providerId}:${keyVersion}`);
}
async function sealKey(plaintext, providerId, keyVersion = 1) {
  const key = await masterKey();
  const iv = crypto.getRandomValues(bytes(IV_BYTES));
  const buf = await crypto.subtle.encrypt(
    { name: ALGO, iv, additionalData: aad(providerId, keyVersion), tagLength: TAG_BITS },
    key,
    utf8(plaintext)
  );
  return {
    ciphertext: b64encode(new Uint8Array(buf)),
    iv: b64encode(iv),
    keyVersion,
    keyHint: plaintext.slice(-4)
  };
}
async function openKey(row) {
  const key = await masterKey();
  const buf = await crypto.subtle.decrypt(
    {
      name: ALGO,
      iv: b64decode(row.iv),
      additionalData: aad(row.providerId, row.keyVersion),
      tagLength: TAG_BITS
    },
    key,
    b64decode(row.ciphertext)
  );
  return new TextDecoder().decode(buf);
}
async function openKeyCached(row) {
  const now = Date.now();
  const hit = cache.get(row.id);
  if (hit && hit.expires > now) return hit.value;
  const value = await openKey(row);
  cache.set(row.id, { value, expires: now + TTL_MS });
  return value;
}
function forgetKey(id) {
  cache.delete(id);
}
function clearKeyCache() {
  cache.clear();
}
async function hashApiKey(plaintext) {
  const digest = await crypto.subtle.digest("SHA-256", utf8(plaintext));
  return Buffer.from(new Uint8Array(digest)).toString("hex");
}
function generateApiKey() {
  const raw5 = crypto.getRandomValues(new Uint8Array(24));
  return `sk-${Buffer.from(raw5).toString("hex")}`;
}
function generateId() {
  return crypto.randomUUID();
}
var ALGO, IV_BYTES, TAG_BITS, cachedMaster, TTL_MS, cache;
var init_keys = __esm({
  "src/crypto/keys.ts"() {
    "use strict";
    init_env();
    ALGO = "AES-GCM";
    IV_BYTES = 12;
    TAG_BITS = 128;
    cachedMaster = null;
    TTL_MS = 5 * 60 * 1e3;
    cache = /* @__PURE__ */ new Map();
  }
});

// scripts/vercel-entry.ts
import { handle } from "hono/vercel";

// src/app.tsx
import { Hono } from "hono";
import { eq as eq5 } from "drizzle-orm";

// src/auth.ts
import { eq } from "drizzle-orm";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

// src/db/client.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  aliases: () => aliases,
  apiKeys: () => apiKeys,
  modelHealth: () => modelHealth,
  models: () => models,
  providerKeys: () => providerKeys,
  providers: () => providers,
  quotaBuckets: () => quotaBuckets,
  quotaLimits: () => quotaLimits,
  requestLog: () => requestLog
});
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  bigint
} from "drizzle-orm/pg-core";
var providers = pgTable("providers", {
  id: text("id").primaryKey(),
  // 'openrouter', 'nvidia', ...
  name: text("name").notNull(),
  /** Base URL for the OpenAI-compatible surface. No trailing slash. */
  baseUrl: text("base_url").notNull(),
  /** 'openai' | 'cloudflare' — see src/providers/adapters.ts */
  adapter: text("adapter").notNull().default("openai"),
  /** Free-text note shown in the dashboard (signup URL, tier caveats). */
  note: text("note"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
var providerKeys = pgTable(
  "provider_keys",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** AES-256-GCM, base64. AAD = `${providerId}:${keyVersion}`. */
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    /** Last four characters, for the dashboard only. Never the whole key. */
    keyHint: text("key_hint").notNull(),
    /** 'active' | 'disabled' | 'invalid' */
    status: text("status").notNull().default("active"),
    /** Least-recently-used ordering for round-robin across keys. */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("provider_keys_provider_idx").on(t.providerId, t.status)]
);
var models = pgTable(
  "models",
  {
    id: text("id").primaryKey(),
    // `${providerId}:${upstreamId}`
    providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
    /** The id the upstream expects in the request body. */
    upstreamId: text("upstream_id").notNull(),
    /** Dedup key: 'gpt-oss-120b', 'glm-5.3', 'gemma-4-31b'. */
    family: text("family").notNull(),
    displayName: text("display_name").notNull(),
    contextLen: integer("context_len"),
    supportsTools: boolean("supports_tools").notNull().default(false),
    supportsVision: boolean("supports_vision").notNull().default(false),
    supportsJson: boolean("supports_json").notNull().default(false),
    isFree: boolean("is_free").notNull().default(true),
    enabled: boolean("enabled").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
  },
  (t) => [
    index("models_provider_idx").on(t.providerId),
    index("models_family_idx").on(t.family)
  ]
);
var quotaLimits = pgTable(
  "quota_limits",
  {
    providerId: text("provider_id").notNull(),
    /** '' (not null) means the limit applies to the whole provider. */
    modelId: text("model_id").notNull().default(""),
    /** 'minute' | 'day' */
    bucketKind: text("bucket_kind").notNull(),
    maxRequests: integer("max_requests"),
    maxTokens: bigint("max_tokens", { mode: "number" })
  },
  (t) => [primaryKey({ columns: [t.providerId, t.modelId, t.bucketKind] })]
);
var aliases = pgTable("aliases", {
  name: text("name").primaryKey(),
  // 'auto', 'fast', 'smart', 'vision'
  strategy: text("strategy").notNull().default("chain"),
  /** Ordered list of model families to try. */
  chain: jsonb("chain").notNull().$type(),
  note: text("note")
});
var quotaBuckets = pgTable(
  "quota_buckets",
  {
    providerId: text("provider_id").notNull(),
    modelId: text("model_id").notNull().default(""),
    bucketKind: text("bucket_kind").notNull(),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    requests: integer("requests").notNull().default(0),
    tokens: bigint("tokens", { mode: "number" }).notNull().default(0)
  },
  (t) => [
    primaryKey({ columns: [t.providerId, t.modelId, t.bucketKind, t.bucketStart] }),
    index("quota_buckets_start_idx").on(t.bucketStart)
  ]
);
var modelHealth = pgTable(
  "model_health",
  {
    modelId: text("model_id").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    successes: integer("successes").notNull().default(0),
    failures: integer("failures").notNull().default(0),
    p95Ms: integer("p95_ms"),
    lastError: text("last_error")
  },
  (t) => [primaryKey({ columns: [t.modelId, t.windowStart] })]
);
var requestLog = pgTable(
  "request_log",
  {
    id: text("id").primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    alias: text("alias"),
    modelId: text("model_id"),
    status: integer("status").notNull(),
    latencyMs: integer("latency_ms"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    fallbacks: integer("fallbacks").notNull().default(0),
    errorCode: text("error_code")
  },
  (t) => [index("request_log_ts_idx").on(t.ts)]
);
var apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  /** SHA-256 of the client key. The key itself is shown once, at creation. */
  keyHash: text("key_hash").notNull().unique(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true })
});

// src/db/client.ts
init_env();
var cached = null;
function db() {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!cached) {
    const sql2 = neon(env.databaseUrl);
    cached = drizzle(sql2, { schema: schema_exports });
  }
  return cached;
}

// src/auth.ts
init_env();
init_keys();
var SESSION_COOKIE = "router_session";
var SESSION_TTL_S = 60 * 60 * 12;
function b64url(bytes2) {
  return Buffer.from(bytes2).toString("base64url");
}
function utf82(text2) {
  const encoded = new TextEncoder().encode(text2);
  const out = new Uint8Array(new ArrayBuffer(encoded.length));
  out.set(encoded);
  return out;
}
async function sign(payload, secret) {
  const key = await crypto.subtle.importKey("raw", utf82(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, utf82(payload));
  return b64url(new Uint8Array(sig));
}
async function makeSession(secret) {
  const expires = Math.floor(Date.now() / 1e3) + SESSION_TTL_S;
  const payload = `v1.${expires}`;
  return `${payload}.${await sign(payload, secret)}`;
}
async function verifySession(token, secret) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [version, expires, shown] = parts;
  if (version !== "v1") return false;
  if (Number(expires) * 1e3 < Date.now()) return false;
  const expected = await sign(`${version}.${expires}`, secret);
  if (expected.length !== shown.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ shown.charCodeAt(i);
  }
  return diff === 0;
}
var requireRouterKey = async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!bearer) {
    return c.json(
      {
        error: {
          code: "unauthorized",
          message: "Missing bearer token. This router is not open to the internet."
        }
      },
      401
    );
  }
  if (env.routerKey && bearer.length === env.routerKey.length) {
    let diff = 0;
    for (let i = 0; i < bearer.length; i++) {
      diff |= bearer.charCodeAt(i) ^ env.routerKey.charCodeAt(i);
    }
    if (diff === 0) return next();
  }
  if (!env.isDemo && bearer.startsWith("sk-")) {
    const hash = await hashApiKey(bearer);
    const rows = await db().select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).limit(1);
    if (rows.length > 0 && rows[0].revokedAt === null) return next();
  }
  return c.json({ error: { code: "unauthorized", message: "Invalid router key." } }, 401);
};
function sessionSecret() {
  return env.sessionSecret || env.dashboardPassword || "dev-only-insecure-secret";
}
var requireDashboard = async (c, next) => {
  if (!env.dashboardPassword) return next();
  const token = getCookie(c, SESSION_COOKIE);
  if (await verifySession(token, sessionSecret())) return next();
  return c.redirect("/login");
};
async function signIn(c, password) {
  if (!env.dashboardPassword || password !== env.dashboardPassword) return false;
  setCookie(c, SESSION_COOKIE, await makeSession(sessionSecret()), {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_S
  });
  return true;
}
function signOut(c) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

// src/app.tsx
init_env();
init_keys();

// src/router/core.ts
import { and as and2, asc, eq as eq3 } from "drizzle-orm";
init_env();
init_keys();

// src/providers/catalog.ts
var PROVIDERS = [
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    adapter: "openai",
    freeRequestsPerDay: 50,
    freeRequestsPerMinute: 20,
    note: "Only `:free` variants count against the free cap. Buying \u226510 credits once raises it to 1000/day."
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    adapter: "openai",
    freeRequestsPerDay: 1e3,
    freeRequestsPerMinute: 40,
    note: "Catalog is public without a key; inference needs one. Dev credits, then paid."
  },
  {
    id: "huggingface",
    name: "HuggingFace Router",
    baseUrl: "https://router.huggingface.co/v1",
    adapter: "openai",
    freeRequestsPerDay: 300,
    note: "Monthly credit allowance rather than a hard daily cap. 162 public models."
  },
  {
    id: "chutes",
    name: "Chutes",
    baseUrl: "https://llm.chutes.ai/v1",
    adapter: "openai",
    freeRequestsPerDay: 200,
    note: "19 public models, mostly TEE-hosted open weights."
  },
  {
    id: "sambanova",
    name: "SambaNova",
    baseUrl: "https://api.sambanova.ai/v1",
    adapter: "openai",
    freeRequestsPerDay: 200,
    note: "Small catalog, five models. Fast on the ones it serves."
  },
  {
    id: "pollinations",
    name: "Pollinations",
    baseUrl: "https://text.pollinations.ai/openai",
    adapter: "openai",
    keyless: true,
    freeRequestsPerDay: 200,
    note: "The only keyless endpoint left. One anonymous model: openai-fast (GPT-OSS 20B)."
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    adapter: "openai",
    freeRequestsPerDay: 1e3,
    freeRequestsPerMinute: 30,
    note: "Per-model caps, not per-account. Lowest time-to-first-token of the set."
  },
  {
    id: "cerebras",
    name: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    adapter: "openai",
    freeRequestsPerMinute: 30,
    freeRequestsPerDay: 900,
    note: "Wafer-scale inference. Free tier is generous on tokens per day."
  },
  {
    id: "gemini",
    name: "Google AI Studio",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    adapter: "openai",
    freeRequestsPerMinute: 15,
    freeRequestsPerDay: 1500,
    note: "Limits are per Google Cloud project; RPD resets at midnight Pacific."
  },
  {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    baseUrl: "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1",
    adapter: "cloudflare",
    freeRequestsPerDay: 300,
    note: "10,000 Neurons/day. Nine frontier models now require a paid method."
  },
  {
    id: "deepinfra",
    name: "DeepInfra",
    baseUrl: "https://api.deepinfra.com/v1/openai",
    adapter: "openai",
    note: "Catalog is public. A handful of small models are free; the rest are metered."
  },
  {
    id: "novita",
    name: "Novita",
    baseUrl: "https://api.novita.ai/v3/openai",
    adapter: "openai",
    note: "Catalog is public. One zero-cost model on the free tier."
  },
  {
    id: "mistral",
    name: "Mistral La Plateforme",
    baseUrl: "https://api.mistral.ai/v1",
    adapter: "openai",
    note: 'Free "experiment" tier. Two zero-cost models in the labs namespace.'
  },
  {
    id: "zhipu",
    name: "Z.ai / Zhipu",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    adapter: "openai",
    note: "Flash-tier models are free: glm-4.5-flash, glm-4.6v-flash, glm-4.7-flash."
  },
  {
    id: "modelscope",
    name: "ModelScope",
    baseUrl: "https://api-inference.modelscope.cn/v1",
    adapter: "openai",
    note: "Seven free models, mostly Qwen and GLM variants."
  },
  {
    id: "tiprouter",
    name: "TipRouter",
    baseUrl: "https://tiprouter.my.id/v1",
    adapter: "openai",
    note: 'OpenAI-compatible endpoint from 9router (tiprouter). Used by the "tiptip" alias/combo; requires TIPROUTER_API_KEY or a stored provider key.'
  }
];
var PROVIDERS_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));
function resolveBaseUrl(def, accountId) {
  return def.baseUrl.replace("{account_id}", accountId ?? "");
}

// src/providers/adapters.ts
var TIMEOUT_MS = 15e3;
function classify(status) {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "quota_paid";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  if (status === 400 || status === 422) return "bad_request";
  return "unknown";
}
function isRetryable(status) {
  return status === 429 || status === 402 || status === 408 || status >= 500;
}
function buildHeaders(kind, apiKey) {
  const headers = {
    "content-type": "application/json",
    accept: "text/event-stream, application/json"
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  if (kind === "openai") headers["http-referer"] = "https://github.com/local/ai-router";
  return headers;
}
function buildUrl(provider, accountId) {
  if (provider.adapter === "cloudflare") {
    if (!accountId) throw new Error("cloudflare provider needs CLOUDFLARE_ACCOUNT_ID");
    return `${resolveBaseUrl(provider, accountId)}/chat/completions`;
  }
  return `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`;
}
async function callChatCompletions(req) {
  const { provider, apiKey, body, accountId } = req;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  req.signal.addEventListener("abort", onAbort);
  try {
    const response = await fetch(buildUrl(provider, accountId), {
      method: "POST",
      headers: buildHeaders(provider.adapter, apiKey),
      body: JSON.stringify(body),
      signal: timeout.signal
    });
    if (response.ok) {
      return { ok: true, response };
    }
    let detail = "";
    try {
      const text2 = await response.text();
      detail = text2.slice(0, 600);
    } catch {
    }
    const retryAfter = response.headers.get("retry-after");
    return {
      ok: false,
      status: response.status,
      code: classify(response.status),
      detail,
      retryAfterMs: retryAfter ? Number(retryAfter) * 1e3 : void 0
    };
  } catch (err) {
    const aborted = err?.name === "AbortError";
    return {
      ok: false,
      status: aborted ? 408 : 502,
      code: aborted ? "timeout" : "network",
      detail: err?.message?.slice(0, 300) ?? "unknown transport error"
    };
  } finally {
    clearTimeout(timer);
    req.signal.removeEventListener("abort", onAbort);
  }
}
async function listModels(provider, apiKey, accountId) {
  const url = provider.adapter === "cloudflare" ? `${resolveBaseUrl(provider, accountId)}/models` : `${provider.baseUrl.replace(/\/$/, "")}/models`;
  const response = await fetch(url, {
    headers: buildHeaders(provider.adapter, apiKey),
    signal: AbortSignal.timeout(15e3)
  });
  if (!response.ok) throw new Error(`${provider.id}: HTTP ${response.status}`);
  const json = await response.json();
  const rows = Array.isArray(json.data) ? json.data : Array.isArray(json.result) ? json.result : [];
  return rows.map((row) => ({
    id: String(row.id ?? row.name ?? ""),
    contextLength: row.context_length ?? row.context_window ?? void 0
  })).filter((row) => row.id.length > 0);
}

// src/quota/buckets.ts
import { and, eq as eq2, gte, inArray } from "drizzle-orm";
init_env();
function bucketStart(kind, now = /* @__PURE__ */ new Date()) {
  if (kind === "minute") {
    const d2 = new Date(now);
    d2.setUTCSeconds(0, 0);
    return d2;
  }
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
var memCounters = /* @__PURE__ */ new Map();
var memLimits = /* @__PURE__ */ new Map();
function memKey(providerId, modelId, kind, start) {
  return `${providerId}|${modelId}|${kind}|${start.toISOString()}`;
}
async function loadCounters(providerIds, now = /* @__PURE__ */ new Date()) {
  const out = /* @__PURE__ */ new Map();
  const dayStart = bucketStart("day", now);
  const minuteStart = bucketStart("minute", now);
  for (const id of providerIds) {
    out.set(id, {
      day: { requests: 0, tokens: 0 },
      minute: { requests: 0, tokens: 0 }
    });
  }
  if (env.isDemo) {
    for (const [providerId, bucket] of out) {
      const dk = memKey(providerId, "", "day", dayStart);
      const mk = memKey(providerId, "", "minute", minuteStart);
      const d = memCounters.get(dk);
      const m = memCounters.get(mk);
      if (d) bucket.day = { ...d };
      if (m) bucket.minute = { ...m };
    }
    return out;
  }
  if (providerIds.length === 0) return out;
  const rows = await db().select().from(quotaBuckets).where(
    and(
      inArray(quotaBuckets.providerId, providerIds),
      eq2(quotaBuckets.modelId, ""),
      gte(quotaBuckets.bucketStart, dayStart)
    )
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
async function loadLimits(providerIds) {
  const out = /* @__PURE__ */ new Map();
  if (env.isDemo) {
    for (const id of providerIds) out.set(id, memLimits.get(id) ?? { maxRequests: null, maxTokens: null });
    return out;
  }
  if (providerIds.length === 0) return out;
  const rows = await db().select().from(quotaLimits).where(and(inArray(quotaLimits.providerId, providerIds), eq2(quotaLimits.modelId, "")));
  for (const row of rows) {
    if (row.bucketKind !== "day") continue;
    out.set(row.providerId, {
      maxRequests: row.maxRequests,
      maxTokens: row.maxTokens === null ? null : Number(row.maxTokens)
    });
  }
  return out;
}
function remaining(limit, counter) {
  if (limit.maxRequests === null) return null;
  return Math.max(0, limit.maxRequests - counter.requests);
}
function hasHeadroom(limit, counter) {
  if (limit.maxRequests === null) return true;
  return counter.requests < limit.maxRequests;
}
async function recordUsage(providerId, tokens, now = /* @__PURE__ */ new Date()) {
  const dayStart = bucketStart("day", now);
  const minuteStart = bucketStart("minute", now);
  if (env.isDemo) {
    for (const [kind, start] of [
      ["day", dayStart],
      ["minute", minuteStart]
    ]) {
      const key = memKey(providerId, "", kind, start);
      const current = memCounters.get(key) ?? { requests: 0, tokens: 0 };
      memCounters.set(key, {
        requests: current.requests + 1,
        tokens: current.tokens + tokens
      });
    }
    return;
  }
  const sql2 = db();
  await sql2.insert(quotaBuckets).values([
    { providerId, modelId: "", bucketKind: "day", bucketStart: dayStart, requests: 1, tokens },
    { providerId, modelId: "", bucketKind: "minute", bucketStart: minuteStart, requests: 1, tokens }
  ]).onConflictDoUpdate({
    target: [
      quotaBuckets.providerId,
      quotaBuckets.modelId,
      quotaBuckets.bucketKind,
      quotaBuckets.bucketStart
    ],
    set: {
      requests: sql2.$count(quotaBuckets.requests),
      tokens: sql2.$count(quotaBuckets.tokens)
    }
  });
}

// src/data/demo.ts
var PROVIDER_USAGE = [
  { id: "nvidia", name: "NVIDIA NIM", limit: 1e3, used: 268, tokens: 2940100, keys: 2, keyHint: "9f2c", keyAge: "4d ago", models: 33, p95: 980, rateLimited: 0, status: "ok", note: "Catalog is public without a key; inference needs one. Dev credits, then paid." },
  { id: "groq", name: "Groq", limit: 1e3, used: 904, tokens: 5211900, keys: 1, keyHint: "a71b", keyAge: "19d ago", models: 14, p95: 410, rateLimited: 11, status: "warn", note: "Caps are per model, not per account. Lowest time-to-first-token of the set." },
  { id: "gemini", name: "Google AI Studio", limit: 1500, used: 377, tokens: 2206300, keys: 1, keyHint: "4d10", keyAge: "2d ago", models: 5, p95: 1190, rateLimited: 0, status: "ok", note: "Limits are per Google Cloud project; the daily count resets at midnight Pacific." },
  { id: "cerebras", name: "Cerebras", limit: 900, used: 512, tokens: 3884e3, keys: 1, keyHint: "e6a4", keyAge: "31d ago", models: 6, p95: 520, rateLimited: 0, status: "ok", note: "Wafer-scale inference. Generous on tokens per day, tight on requests per minute." },
  { id: "cloudflare", name: "Cloudflare Workers AI", limit: 300, used: 286, tokens: 1402500, keys: 1, keyHint: "77be", keyAge: "9d ago", models: 41, p95: 1620, rateLimited: 2, status: "warn", note: "10,000 Neurons a day. Nine frontier models now require a paid method." },
  { id: "huggingface", name: "HuggingFace Router", limit: 300, used: 211, tokens: 1764400, keys: 1, keyHint: "10cd", keyAge: "6d ago", models: 162, p95: 2310, rateLimited: 3, status: "ok", note: "A monthly credit allowance rather than a hard daily cap. 162 public models." },
  { id: "zhipu", name: "Z.ai / Zhipu", limit: 500, used: 129, tokens: 702400, keys: 1, keyHint: "3b8f", keyAge: "12d ago", models: 3, p95: 1740, rateLimited: 0, status: "ok", note: "The Flash tier is free: glm-4.5-flash, glm-4.6v-flash, glm-4.7-flash." },
  { id: "chutes", name: "Chutes", limit: 200, used: 63, tokens: 388900, keys: 1, keyHint: "c918", keyAge: "27d ago", models: 19, p95: 2870, rateLimited: 1, status: "ok", note: "19 public models, mostly TEE-hosted open weights. Cold starts are slow." },
  { id: "sambanova", name: "SambaNova", limit: 200, used: 44, tokens: 301200, keys: 1, keyHint: "5e27", keyAge: "3d ago", models: 5, p95: 1050, rateLimited: 0, status: "ok", note: "Small catalog, five models. Fast on the ones it serves." },
  { id: "openrouter", name: "OpenRouter", limit: 50, used: 41, tokens: 412800, keys: 1, keyHint: "2ad6", keyAge: "today", models: 12, p95: 1840, rateLimited: 6, status: "warn", note: "Only the :free variants count against the cap. Buying 10 credits once raises it to 1,000 a day." },
  { id: "pollinations", name: "Pollinations", limit: 200, used: 18, tokens: 74100, keys: 0, keyHint: null, keyAge: "keyless", models: 1, p95: 3240, rateLimited: 4, status: "degraded", note: "The only keyless endpoint left. One anonymous model: openai-fast, GPT-OSS 20B." }
];
var PROVIDERS_OFF = [
  { id: "deepinfra", name: "DeepInfra", reason: "No key" },
  { id: "novita", name: "Novita", reason: "No key" },
  { id: "mistral", name: "Mistral La Plateforme", reason: "No key" },
  { id: "modelscope", name: "ModelScope", reason: "Parked: slow cold starts" }
];
var REQUEST_PROFILE = [
  1.4,
  0.9,
  0.6,
  0.5,
  0.8,
  1.6,
  3.1,
  5.4,
  7.8,
  9.2,
  10.1,
  9.6,
  8.1,
  9.4,
  10.4,
  9.8,
  8.7,
  6.9,
  4.8,
  3.6,
  2.8,
  2.1,
  1.7,
  1.3
];
var TOKEN_PROFILE = [
  2.1,
  1.2,
  0.7,
  0.5,
  0.9,
  2.2,
  4.4,
  7.1,
  9.4,
  10.2,
  10.6,
  9.1,
  7.2,
  8.4,
  9.9,
  10.3,
  8.1,
  5.9,
  3.9,
  2.6,
  1.9,
  1.4,
  1.1,
  0.8
];
function apportion(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw5 = weights.map((w) => w / sum * total);
  const floors = raw5.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw5.map((value, index2) => ({ index: index2, frac: value - Math.floor(value) })).sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < order.length && remainder > 0; i++, remainder--) {
    floors[order[i].index] += 1;
  }
  return floors;
}
var REQUESTS_TODAY = PROVIDER_USAGE.reduce((a, p) => a + p.used, 0);
var TOKENS_TODAY = PROVIDER_USAGE.reduce((a, p) => a + p.tokens, 0);
var CAPACITY_TODAY = PROVIDER_USAGE.reduce((a, p) => a + p.limit, 0);
var RATE_LIMITED_TODAY = PROVIDER_USAGE.reduce((a, p) => a + p.rateLimited, 0);
var PROVIDERS_LIVE = PROVIDER_USAGE.length;
var NOW = /* @__PURE__ */ new Date();
var CURRENT_HOUR = NOW.getUTCHours();
function byHour(total, profile) {
  const elapsed = apportion(total, profile.slice(0, CURRENT_HOUR + 1));
  const pad = Array.from({ length: 24 - elapsed.length }, () => 0);
  return [...elapsed, ...pad];
}
var HOURLY = byHour(REQUESTS_TODAY, REQUEST_PROFILE);
var HOURLY_TOKENS = byHour(TOKENS_TODAY, TOKEN_PROFILE);
var HOUR_LABELS = Array.from(
  { length: 24 },
  (_, h) => `${String(h).padStart(2, "0")}:00`
);
function utcStamp(when = NOW) {
  const day = when.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${day} \xB7 ${when.toISOString().slice(11, 16)} UTC`;
}
var WEIGHTED_P95 = Math.round(
  PROVIDER_USAGE.reduce((a, p) => a + p.p95 * p.used, 0) / Math.max(1, REQUESTS_TODAY)
);
var MODEL_ROWS = [
  { family: "gpt-oss-120b", providers: ["sambanova", "cloudflare", "huggingface", "chutes", "cerebras"], contextK: 131, tools: true, vision: false, served: 486 },
  { family: "glm-5.3", providers: ["nvidia", "zhipu", "chutes", "huggingface"], contextK: 1e3, tools: true, vision: false, served: 341 },
  { family: "qwen3.8-27b", providers: ["huggingface", "chutes", "nvidia"], contextK: 262, tools: true, vision: false, served: 302 },
  { family: "gemma-4-31b-it", providers: ["nvidia", "huggingface", "sambanova", "openrouter"], contextK: 262, tools: false, vision: true, served: 264 },
  { family: "nemotron-3.5-lightning", providers: ["nvidia", "openrouter"], contextK: 1e3, tools: true, vision: false, served: 218 },
  { family: "kimi-k3.1-pro", providers: ["nvidia", "chutes", "huggingface"], contextK: 262, tools: true, vision: false, served: 191 },
  { family: "deepseek-v4.1-flash", providers: ["cloudflare", "chutes", "huggingface"], contextK: 1e3, tools: true, vision: false, served: 176 },
  { family: "llama-3.3-70b", providers: ["sambanova", "cloudflare", "groq"], contextK: 131, tools: true, vision: false, served: 158 },
  { family: "openai-fast", providers: ["pollinations"], contextK: 131, tools: true, vision: false, served: 77 },
  { family: "glm-4.7-flash", providers: ["zhipu"], contextK: 200, tools: true, vision: false, served: 64 },
  { family: "qwen3-30b-a3b", providers: ["nvidia", "huggingface"], contextK: 262, tools: true, vision: false, served: 52 },
  { family: "gemini-3.5-flash-lite", providers: ["gemini"], contextK: 1e3, tools: true, vision: true, served: 48 }
];
var MODEL_FAMILIES = MODEL_ROWS.length;
var MODEL_ENDPOINTS = MODEL_ROWS.reduce((a, m) => a + m.providers.length, 0);
var MODEL_SERVED = MODEL_ROWS.reduce((a, m) => a + m.served, 0);
var MODEL_LONGEST = Math.max(...MODEL_ROWS.map((m) => m.contextK));
var RECENT_REQUESTS = [
  { id: "a4f19c02b7d3", minutesAgo: 0, family: "gpt-oss-120b", provider: "sambanova", status: 200, ms: 812, tokens: 1204, fallbacks: 0 },
  { id: "8c21e5a90f47", minutesAgo: 1, family: "glm-5.3", provider: "nvidia", status: 200, ms: 1340, tokens: 2318, fallbacks: 0 },
  { id: "f30b7d4e12a8", minutesAgo: 2, family: "qwen3.8-27b", provider: "huggingface", status: 200, ms: 2104, tokens: 986, fallbacks: 1 },
  { id: "1d8a3f60c95e", minutesAgo: 4, family: "llama-3.3-70b", provider: "groq", status: 429, ms: 156, tokens: 0, fallbacks: 0 },
  { id: "6e02b9c47af1", minutesAgo: 5, family: "gemma-4-31b-it", provider: "nvidia", status: 200, ms: 1902, tokens: 3441, fallbacks: 0 },
  { id: "c57f18d3a260", minutesAgo: 7, family: "deepseek-v4.1-flash", provider: "cloudflare", status: 200, ms: 1488, tokens: 1672, fallbacks: 2 },
  { id: "9b4e6a02d817", minutesAgo: 9, family: "kimi-k3.1-pro", provider: "chutes", status: 200, ms: 2766, tokens: 4019, fallbacks: 1 },
  { id: "2f7c90b5e13a", minutesAgo: 12, family: "openai-fast", provider: "pollinations", status: 200, ms: 3120, tokens: 742, fallbacks: 3 }
];
var AUTO_CHAIN = [
  { provider: "nvidia", family: "gpt-oss-120b", left: 732, state: "live" },
  { provider: "sambanova", family: "gpt-oss-120b", left: 156, state: "live" },
  { provider: "cerebras", family: "gpt-oss-120b", left: 388, state: "live" },
  { provider: "groq", family: "llama-3.3-70b", left: 96, state: "live" },
  { provider: "cloudflare", family: "gpt-oss-120b", left: 14, state: "cooling" },
  { provider: "openrouter", family: "gemma-4-31b-it", left: 9, state: "cooling" },
  { provider: "huggingface", family: "glm-5.3", left: 89, state: "live" },
  { provider: "pollinations", family: "openai-fast", left: 0, state: "exhausted" }
];
var CHAIN_TOTAL = AUTO_CHAIN.reduce((a, n) => a + n.left, 0);
var CHAIN_LIVE = AUTO_CHAIN.filter((n) => n.state === "live").length;
var burn = (p) => p.limit === 0 ? 0 : p.used / p.limit;
var NEAR_CAP = [...PROVIDER_USAGE].sort((a, b) => burn(b) - burn(a)).slice(0, 6);
var NAME_BY_ID = new Map(PROVIDER_USAGE.map((p) => [p.id, p.name]));
function providerName(id) {
  return NAME_BY_ID.get(id) ?? id;
}
function compact(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return n.toLocaleString("en-US");
}
function thousands(n) {
  return n.toLocaleString("en-US");
}
var hourlySum = HOURLY.reduce((a, b) => a + b, 0);
console.assert(hourlySum === REQUESTS_TODAY, `hourly ${hourlySum} != provider total ${REQUESTS_TODAY}`);
console.assert(
  HOURLY_TOKENS.reduce((a, b) => a + b, 0) === TOKENS_TODAY,
  "token series does not sum to the provider token total"
);
console.assert(
  HOURLY.slice(CURRENT_HOUR + 1).every((v) => v === 0),
  "hours after the current one must be zero \u2014 the day has not happened yet"
);
console.assert(
  CAPACITY_TODAY >= REQUESTS_TODAY,
  `capacity ${CAPACITY_TODAY} below usage ${REQUESTS_TODAY}`
);
console.assert(
  MODEL_ROWS.every((m) => m.providers.every((p) => PROVIDER_USAGE.some((u) => u.id === p))),
  "a model row references a provider that is not in PROVIDER_USAGE"
);
console.assert(MODEL_SERVED <= REQUESTS_TODAY, "model rows claim more traffic than the day total");
console.assert(CHAIN_TOTAL === 1484, `chain remaining ${CHAIN_TOTAL} does not match the stated 1,484`);
console.assert(
  AUTO_CHAIN.every((n) => n.left >= 0),
  "a chain node has negative remaining quota"
);

// src/data/zeroCostModels.ts
var ZERO_COST_MODELS = [{ "provider": "cheapllm", "model": "deepseek-v4.1-flash-1017", "ctx": 1e6 }, { "provider": "tencent-coding-plan", "model": "hunyuan-t1", "ctx": 131072 }, { "provider": "tencent-coding-plan", "model": "tc-code-latest", "ctx": 131072 }, { "provider": "tencent-coding-plan", "model": "glm-5", "ctx": 202752 }, { "provider": "tencent-coding-plan", "model": "hunyuan-2.0-thinking", "ctx": 131072 }, { "provider": "tencent-coding-plan", "model": "minimax-m2.5", "ctx": 204800 }, { "provider": "tencent-coding-plan", "model": "hunyuan-2.0-instruct", "ctx": 131072 }, { "provider": "tencent-coding-plan", "model": "kimi-k2.5", "ctx": 262144 }, { "provider": "tencent-coding-plan", "model": "hunyuan-turbos", "ctx": 131072 }, { "provider": "ovhcloud", "model": "qwen3guard-gen-0.6b", "ctx": 32768 }, { "provider": "ovhcloud", "model": "qwen3guard-gen-8b", "ctx": 32768 }, { "provider": "kuae-cloud-coding-plan", "model": "GLM-4.7", "ctx": 204800 }, { "provider": "qiniu-ai", "model": "meituan/longcat-flash-lite", "ctx": 256e3 }, { "provider": "alibaba-coding-plan-cn", "model": "qwen3-max-2026-01-23", "ctx": 262144 }, { "provider": "alibaba-coding-plan-cn", "model": "glm-5", "ctx": 202752 }, { "provider": "alibaba-coding-plan-cn", "model": "qwen3.5-plus", "ctx": 1e6 }, { "provider": "alibaba-coding-plan-cn", "model": "glm-4.7", "ctx": 202752 }, { "provider": "alibaba-coding-plan-cn", "model": "qwen3-coder-plus", "ctx": 1e6 }, { "provider": "alibaba-coding-plan-cn", "model": "qwen3.6-plus", "ctx": 1e6 }, { "provider": "alibaba-coding-plan-cn", "model": "qwen3.7-plus", "ctx": 1e6 }, { "provider": "alibaba-coding-plan-cn", "model": "MiniMax-M2.5", "ctx": 196608 }, { "provider": "alibaba-coding-plan-cn", "model": "kimi-k2.5", "ctx": 262144 }, { "provider": "alibaba-coding-plan-cn", "model": "qwen3-coder-next", "ctx": 262144 }, { "provider": "kimi-code-plan-global", "model": "k3.1-pro", "ctx": 1048576 }, { "provider": "kimi-code-plan-global", "model": "k3.1-pro-highspeed", "ctx": 1048576 }, { "provider": "kimi-code-plan-global", "model": "kimi-for-coding-highspeed", "ctx": 262144 }, { "provider": "kimi-code-plan-global", "model": "k3", "ctx": 1048576 }, { "provider": "kimi-code-plan-global", "model": "k3-256k", "ctx": 262144 }, { "provider": "kimi-code-plan-global", "model": "kimi-for-coding", "ctx": 1048576 }, { "provider": "alibaba-token-plan", "model": "deepseek-v4-pro", "ctx": 1e6 }, { "provider": "alibaba-token-plan", "model": "happyhorse-1.1-i2v", "ctx": 0 }, { "provider": "alibaba-token-plan", "model": "happyhorse-1.1-r2v", "ctx": 0 }, { "provider": "alibaba-token-plan", "model": "qwen3.8-max", "ctx": 1e6 }, { "provider": "alibaba-token-plan", "model": "happyhorse-1.1-t2v", "ctx": 0 }, { "provider": "alibaba-token-plan", "model": "qwen3.6-flash", "ctx": 1e6 }, { "provider": "alibaba-token-plan", "model": "qwen3.8-max-preview", "ctx": 1e6 }, { "provider": "alibaba-token-plan", "model": "qwen3.7-max", "ctx": 1e6 }, { "provider": "alibaba-token-plan", "model": "glm-5", "ctx": 202752 }, { "provider": "alibaba-token-plan", "model": "deepseek-v4.1-flash-1017", "ctx": 1e6 }, { "provider": "alibaba-token-plan", "model": "qwen-image-2.0-pro", "ctx": 8192 }, { "provider": "alibaba-token-plan", "model": "glm-5.3", "ctx": 1e6 }, { "provider": "alibaba-token-plan", "model": "deepseek-v4-flash-0731", "ctx": 1e6 }, { "provider": "alibaba-token-plan", "model": "wan2.7-image", "ctx": 8192 }, { "provider": "alibaba-token-plan", "model": "wan2.7-image-pro", "ctx": 8192 }, { "provider": "alibaba-token-plan", "model": "qwen3.6-plus", "ctx": 1e6 }, { "provider": "alibaba-token-plan", "model": "deepseek-v3.2", "ctx": 131072 }, { "provider": "alibaba-token-plan", "model": "deepseek-v4.1-flash", "ctx": 1e6 }, { "provider": "alibaba-token-plan", "model": "qwen3.7-plus", "ctx": 1e6 }, { "provider": "alibaba-token-plan", "model": "glm-5.2", "ctx": 1e6 }, { "provider": "alibaba-token-plan", "model": "MiniMax-M2.5", "ctx": 196608 }, { "provider": "alibaba-token-plan", "model": "deepseek-v4-flash", "ctx": 1e6 }, { "provider": "alibaba-token-plan", "model": "glm-5.1", "ctx": 202752 }, { "provider": "alibaba-token-plan", "model": "qwen3.8-flash", "ctx": 1e6 }, { "provider": "alibaba-token-plan", "model": "kimi-k2.5", "ctx": 262144 }, { "provider": "alibaba-token-plan", "model": "qwen-image-2.0", "ctx": 8192 }, { "provider": "alibaba-token-plan", "model": "deepseek-v4-pro-0813", "ctx": 1e6 }, { "provider": "alibaba-token-plan", "model": "kimi-k2.7-code", "ctx": 262144 }, { "provider": "alibaba-token-plan", "model": "kimi-k2.6", "ctx": 262144 }, { "provider": "cortecs", "model": "qwen3guard-gen-0.6b", "ctx": 32e3 }, { "provider": "cortecs", "model": "qwen3guard-gen-8b", "ctx": 32e3 }, { "provider": "nova", "model": "nova-2-pro-v1", "ctx": 1e6 }, { "provider": "nova", "model": "nova-2-lite-v1", "ctx": 1e6 }, { "provider": "xiaomi-token-plan-ams", "model": "mimo-v2.6-flash", "ctx": 1048576 }, { "provider": "xiaomi-token-plan-ams", "model": "mimo-v2.6-pro", "ctx": 1048576 }, { "provider": "xiaomi-token-plan-ams", "model": "mimo-v2.5", "ctx": 1048576 }, { "provider": "xiaomi-token-plan-ams", "model": "mimo-v2.5-tts-voicedesign", "ctx": 8192 }, { "provider": "xiaomi-token-plan-ams", "model": "mimo-v2.5-pro", "ctx": 1048576 }, { "provider": "xiaomi-token-plan-ams", "model": "mimo-v2.5-tts-voiceclone", "ctx": 8192 }, { "provider": "xiaomi-token-plan-ams", "model": "mimo-v2.5-tts", "ctx": 8192 }, { "provider": "empiriolabs", "model": "glm-4-7-flash", "ctx": 202752 }, { "provider": "empiriolabs", "model": "glm-4-6v-flash", "ctx": 131072 }, { "provider": "empiriolabs", "model": "gemma-3-27b", "ctx": 131072 }, { "provider": "empiriolabs", "model": "glm-4-5-flash", "ctx": 131072 }, { "provider": "zhipuai-coding-plan", "model": "glm-5.3-highspeed", "ctx": 1e6 }, { "provider": "zhipuai-coding-plan", "model": "glm-5.3", "ctx": 1e6 }, { "provider": "zhipuai-coding-plan", "model": "glm-4.6v", "ctx": 128e3 }, { "provider": "zhipuai-coding-plan", "model": "glm-5.3-flash", "ctx": 1e6 }, { "provider": "qvac", "model": "qwen3.5-9b", "ctx": 32768 }, { "provider": "qvac", "model": "qwen3.5-2b", "ctx": 32768 }, { "provider": "qvac", "model": "qwen3.5-4b", "ctx": 32768 }, { "provider": "qvac", "model": "qwen3.6-27b", "ctx": 262144 }, { "provider": "qvac", "model": "qwen3.6-35b-a3b", "ctx": 262144 }, { "provider": "qvac", "model": "qwen3.5-0.8b", "ctx": 32768 }, { "provider": "qvac", "model": "gpt-oss-120b", "ctx": 131072 }, { "provider": "qvac", "model": "gpt-oss-20b", "ctx": 131072 }, { "provider": "qvac", "model": "gemma4-31b", "ctx": 262144 }, { "provider": "nan", "model": "gemma4", "ctx": 262144 }, { "provider": "nan", "model": "qwen3.6", "ctx": 262144 }, { "provider": "minimax-cn-coding-plan", "model": "MiniMax-M2.7-highspeed", "ctx": 204800 }, { "provider": "minimax-cn-coding-plan", "model": "MiniMax-M3.1-Flash", "ctx": 1e6 }, { "provider": "minimax-cn-coding-plan", "model": "MiniMax-M3", "ctx": 1e6 }, { "provider": "minimax-cn-coding-plan", "model": "MiniMax-M3.1-Flash-Preview", "ctx": 1e6 }, { "provider": "minimax-cn-coding-plan", "model": "MiniMax-M2.5-highspeed", "ctx": 204800 }, { "provider": "minimax-cn-coding-plan", "model": "MiniMax-M2", "ctx": 204800 }, { "provider": "minimax-cn-coding-plan", "model": "MiniMax-M2.7", "ctx": 204800 }, { "provider": "minimax-cn-coding-plan", "model": "MiniMax-M2.1", "ctx": 204800 }, { "provider": "minimax-cn-coding-plan", "model": "MiniMax-M2.5", "ctx": 204800 }, { "provider": "groq", "model": "allam-2-7b", "ctx": 4096 }, { "provider": "kilo", "model": "recursive/flint-v1.0", "ctx": 262144 }, { "provider": "kilo", "model": "recursive/flint-v1.0:free", "ctx": 262144 }, { "provider": "kilo", "model": "dots-studio/dots-3-note-preview:free", "ctx": 512e3 }, { "provider": "kilo", "model": "cohere/north-mini-code:free", "ctx": 256e3 }, { "provider": "kilo", "model": "inclusionai/ling-3.2-flash:free", "ctx": 1048576 }, { "provider": "kilo", "model": "stealth/glyph-cluster", "ctx": 256e3 }, { "provider": "kilo", "model": "liquid/lfm-3-1.7b:free", "ctx": 262144 }, { "provider": "kilo", "model": "reflection/beam-free", "ctx": 1048576 }, { "provider": "kilo", "model": "openrouter/pareto-code", "ctx": 2e5 }, { "provider": "kilo", "model": "openrouter/bodybuilder", "ctx": 128e3 }, { "provider": "kilo", "model": "openrouter/free", "ctx": 2e5 }, { "provider": "kilo", "model": "openrouter/auto", "ctx": 2e6 }, { "provider": "kilo", "model": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "ctx": 256e3 }, { "provider": "kilo", "model": "nvidia/nemotron-3.5-lightning:free", "ctx": 1e6 }, { "provider": "kilo", "model": "nvidia/nemotron-3.5-super-vl:free", "ctx": 1e6 }, { "provider": "kilo", "model": "nvidia/nemotron-3-ultra-550b-a55b:free", "ctx": 1e6 }, { "provider": "kilo", "model": "kilo-auto/free", "ctx": 256e3 }, { "provider": "kilo", "model": "google/lyria-3-pro-preview", "ctx": 1048576 }, { "provider": "kilo", "model": "google/lyria-3-clip-preview", "ctx": 1048576 }, { "provider": "kilo", "model": "particle-ai/particle-1:free", "ctx": 1048576 }, { "provider": "kilo", "model": "humansand/ampersand-v0.1", "ctx": 1e6 }, { "provider": "kilo", "model": "baidu/ernie-5.5-flash-preview:free", "ctx": 1024e3 }, { "provider": "nano-gpt", "model": "auto-model", "ctx": 1e6 }, { "provider": "nano-gpt", "model": "nano-gpt-help", "ctx": 6e3 }, { "provider": "nano-gpt", "model": "kitani/clover-2", "ctx": 2e5 }, { "provider": "nano-gpt", "model": "kitani/clover-2:thinking", "ctx": 2e5 }, { "provider": "tencent-tokenhub", "model": "hy3", "ctx": 256e3 }, { "provider": "tencent-tokenhub", "model": "hy3-preview", "ctx": 256e3 }, { "provider": "cohere", "model": "north-small-translate-09-2026", "ctx": 32768 }, { "provider": "cohere", "model": "north-mini-code-1-0", "ctx": 256e3 }, { "provider": "alibaba-cn", "model": "deepseek-r1-distill-qwen-1-5b", "ctx": 32768 }, { "provider": "alibaba-cn", "model": "deepseek-r1-distill-llama-8b", "ctx": 32768 }, { "provider": "agnes", "model": "agnes-3.0-flash", "ctx": 512e3 }, { "provider": "agnes", "model": "agnes-2.0-flash", "ctx": 512e3 }, { "provider": "agnes", "model": "agnes-2.5-flash", "ctx": 512e3 }, { "provider": "zenmux", "model": "z-ai/glm-4.6v-flash-free", "ctx": 2e5 }, { "provider": "zenmux", "model": "z-ai/glm-4.7-flash-free", "ctx": 2e5 }, { "provider": "commandcode", "model": "inclusionai/ling-3.1-flash:free", "ctx": 262144 }, { "provider": "commandcode", "model": "stealth/glyph-cluster:free", "ctx": 256e3 }, { "provider": "commandcode", "model": "reflection/beam:free", "ctx": 1048576 }, { "provider": "commandcode", "model": "poolside/laguna-s-2.1-free", "ctx": 256e3 }, { "provider": "novita-ai", "model": "apodex/apodex-1.1-mini", "ctx": 262144 }, { "provider": "inferx", "model": "Qwen3.6-35B-A3B-FP8", "ctx": 262e3 }, { "provider": "inferx", "model": "Devstral-2-123B-Instruct-2512-int4-AutoRound", "ctx": 128e3 }, { "provider": "inferx", "model": "mimo-v25", "ctx": 1e6 }, { "provider": "inferx", "model": "Qwen3-Coder-Next-FP8-no-thinking", "ctx": 26e4 }, { "provider": "inferx", "model": "Qwen3.6-35B-A3B-fp8-no-thinking", "ctx": 262e3 }, { "provider": "inferx", "model": "gemma-4-31B-it-fp8", "ctx": 262144 }, { "provider": "inferx", "model": "deepseek-v4-flash", "ctx": 1e6 }, { "provider": "inferx", "model": "Agents-A1", "ctx": 262e3 }, { "provider": "inferx", "model": "Ornith-1.0-35B-FP8", "ctx": 262e3 }, { "provider": "inferx", "model": "Qwen3.6-27B-FP8", "ctx": 262144 }, { "provider": "inferx", "model": "Qwen3-Embedding-8B", "ctx": 32768 }, { "provider": "inferx", "model": "Qwen3-Coder-Next-FP8", "ctx": 256144 }, { "provider": "modelscope", "model": "ZhipuAI/GLM-4.6", "ctx": 202752 }, { "provider": "modelscope", "model": "ZhipuAI/GLM-4.5", "ctx": 131072 }, { "provider": "modelscope", "model": "Qwen/Qwen3-235B-A22B-Instruct-2507", "ctx": 262144 }, { "provider": "modelscope", "model": "Qwen/Qwen3-235B-A22B-Thinking-2507", "ctx": 262144 }, { "provider": "modelscope", "model": "Qwen/Qwen3-30B-A3B-Instruct-2507", "ctx": 262144 }, { "provider": "modelscope", "model": "Qwen/Qwen3-Coder-30B-A3B-Instruct", "ctx": 262144 }, { "provider": "modelscope", "model": "Qwen/Qwen3-30B-A3B-Thinking-2507", "ctx": 262144 }, { "provider": "minimax-coding-plan", "model": "MiniMax-M2.7-highspeed", "ctx": 204800 }, { "provider": "minimax-coding-plan", "model": "MiniMax-M3.1-Flash", "ctx": 1e6 }, { "provider": "minimax-coding-plan", "model": "MiniMax-M3", "ctx": 1e6 }, { "provider": "minimax-coding-plan", "model": "MiniMax-M3.1-Flash-Preview", "ctx": 1e6 }, { "provider": "minimax-coding-plan", "model": "MiniMax-M2.5-highspeed", "ctx": 204800 }, { "provider": "minimax-coding-plan", "model": "MiniMax-M2", "ctx": 204800 }, { "provider": "minimax-coding-plan", "model": "MiniMax-M2.7", "ctx": 204800 }, { "provider": "minimax-coding-plan", "model": "MiniMax-M2.1", "ctx": 204800 }, { "provider": "minimax-coding-plan", "model": "MiniMax-M2.5", "ctx": 204800 }, { "provider": "meganova", "model": "mistralai/Mistral-Small-3.2-24B-Instruct-2506", "ctx": 32768 }, { "provider": "zai-coding-plan", "model": "glm-5.3-highspeed", "ctx": 1e6 }, { "provider": "zai-coding-plan", "model": "glm-4.7", "ctx": 204800 }, { "provider": "zai-coding-plan", "model": "glm-5.3", "ctx": 1e6 }, { "provider": "zai-coding-plan", "model": "glm-5-turbo", "ctx": 2e5 }, { "provider": "zai-coding-plan", "model": "glm-5.2-highspeed", "ctx": 1e6 }, { "provider": "zai-coding-plan", "model": "glm-5.2", "ctx": 1e6 }, { "provider": "zai-coding-plan", "model": "glm-5.3-flash", "ctx": 1e6 }, { "provider": "reflection", "model": "Beam-1.0-501B-A23B", "ctx": 1048576 }, { "provider": "zhipuai", "model": "glm-4.6v-flash", "ctx": 128e3 }, { "provider": "zhipuai", "model": "glm-4.7-flash", "ctx": 2e5 }, { "provider": "zhipuai", "model": "glm-4.5-flash", "ctx": 131072 }, { "provider": "poe", "model": "fireworks-ai/kimi-k2.5-fw", "ctx": 262144 }, { "provider": "poe", "model": "google/gemma-4-31b", "ctx": 262144 }, { "provider": "poe", "model": "openai/gpt-5.3-codex-spark", "ctx": 128e3 }, { "provider": "zeldoc", "model": "zdev", "ctx": 1e6 }, { "provider": "pendra", "model": "glm-4.7-flash", "ctx": 2e5 }, { "provider": "pendra", "model": "qwen3.6:27b", "ctx": 262144 }, { "provider": "pendra", "model": "llama3.3:70b", "ctx": 128e3 }, { "provider": "pendra", "model": "deepseek-v4-flash", "ctx": 1e6 }, { "provider": "pendra", "model": "qwen3-coder:30b", "ctx": 262144 }, { "provider": "pendra", "model": "gpt-oss:120b", "ctx": 131072 }, { "provider": "kenari", "model": "longcat-2-5:free", "ctx": 1e6 }, { "provider": "kenari", "model": "hy4-flash:free", "ctx": 1048576 }, { "provider": "kenari", "model": "muse-glimmer-30b:free", "ctx": 131072 }, { "provider": "kenari", "model": "beam-1-0:free", "ctx": 262144 }, { "provider": "kenari", "model": "particle-1:free", "ctx": 1048576 }, { "provider": "kenari", "model": "solar-mini4:free", "ctx": 524288 }, { "provider": "kenari", "model": "glm-4-6v-flash:free", "ctx": 128e3 }, { "provider": "kenari", "model": "qwen4-max:free", "ctx": 1e6 }, { "provider": "kenari", "model": "nemotron-3-ultra-550b-a55b:free", "ctx": 1e6 }, { "provider": "kenari", "model": "glm-4-7-flash:free", "ctx": 2e5 }, { "provider": "openrouter", "model": "recursive/flint-v1.0:free", "ctx": 262144 }, { "provider": "openrouter", "model": "dots-studio/dots-3-note-preview:free", "ctx": 512e3 }, { "provider": "openrouter", "model": "cohere/north-mini-code:free", "ctx": 256e3 }, { "provider": "openrouter", "model": "inclusionai/ling-3.2-flash:free", "ctx": 1048576 }, { "provider": "openrouter", "model": "liquid/lfm-3-1.7b:free", "ctx": 262144 }, { "provider": "openrouter", "model": "openrouter/free", "ctx": 2e5 }, { "provider": "openrouter", "model": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "ctx": 256e3 }, { "provider": "openrouter", "model": "nvidia/nemotron-3.5-lightning:free", "ctx": 1e6 }, { "provider": "openrouter", "model": "nvidia/nemotron-3.5-super-vl:free", "ctx": 1e6 }, { "provider": "openrouter", "model": "nvidia/nemotron-3-ultra-550b-a55b:free", "ctx": 1e6 }, { "provider": "openrouter", "model": "google/lyria-3-pro-preview", "ctx": 1048576 }, { "provider": "openrouter", "model": "google/gemma-4-26b-a4b-it:free", "ctx": 262144 }, { "provider": "openrouter", "model": "google/lyria-3-clip-preview", "ctx": 1048576 }, { "provider": "openrouter", "model": "google/gemma-4-31b-it:free", "ctx": 262144 }, { "provider": "openrouter", "model": "particle-ai/particle-1:free", "ctx": 1048576 }, { "provider": "openrouter", "model": "baidu/ernie-5.5-flash-preview:free", "ctx": 1024e3 }, { "provider": "aihubmix", "model": "coding-glm-5.1-free", "ctx": 2e5 }, { "provider": "aihubmix", "model": "coding-glm-5.2-free", "ctx": 1e6 }, { "provider": "aihubmix", "model": "xiaomi-mimo-v2.5-free", "ctx": 1048576 }, { "provider": "aihubmix", "model": "coding-minimax-m2.7-free", "ctx": 204800 }, { "provider": "aihubmix", "model": "nemotron-3.5-content-safety-free", "ctx": 128e3 }, { "provider": "aihubmix", "model": "coding-glm-5.3-flash-free", "ctx": 1e6 }, { "provider": "aihubmix", "model": "ling-3.0-flash-free", "ctx": 262144 }, { "provider": "aihubmix", "model": "gemma-4-26b-a4b-it-free", "ctx": 262144 }, { "provider": "aihubmix", "model": "xiaomi-mimo-v2.5-pro-free", "ctx": 1048576 }, { "provider": "aihubmix", "model": "nemotron-3-super-120b-a12b-free", "ctx": 262144 }, { "provider": "aihubmix", "model": "glm-4.7-flash-free", "ctx": 2e5 }, { "provider": "aihubmix", "model": "nemotron-3.5-lightning-free", "ctx": 262144 }, { "provider": "aihubmix", "model": "coding-glm-5.3-free", "ctx": 1e6 }, { "provider": "aihubmix", "model": "nemotron-3-nano-omni-30b-a3b-reasoning-free", "ctx": 256e3 }, { "provider": "aihubmix", "model": "gemma-4-31b-it-free", "ctx": 262144 }, { "provider": "aihubmix", "model": "nemotron-3-ultra-550b-a55b-free", "ctx": 1e6 }, { "provider": "aihubmix", "model": "qwen3.8-flash-free", "ctx": 1e6 }, { "provider": "aihubmix", "model": "qwen3.8-max-free", "ctx": 1e6 }, { "provider": "jad-ai", "model": "jad-code", "ctx": 256e3 }, { "provider": "jad-ai", "model": "jad-ai", "ctx": 65e3 }, { "provider": "jad-ai", "model": "jad-go", "ctx": 256e3 }, { "provider": "orcarouter", "model": "tencent/hy3-free", "ctx": 256e3 }, { "provider": "orcarouter", "model": "z-ai/glm-5.3-flash-free", "ctx": 1e6 }, { "provider": "orcarouter", "model": "deepseek/deepseek-v4-flash-free", "ctx": 1e6 }, { "provider": "orcarouter", "model": "orcarouter/free", "ctx": 65536 }, { "provider": "orcarouter", "model": "orcarouter/auto", "ctx": 128e3 }, { "provider": "xiaomi-token-plan-cn", "model": "mimo-v2.6-flash", "ctx": 1048576 }, { "provider": "xiaomi-token-plan-cn", "model": "mimo-v2.5-tts", "ctx": 8192 }, { "provider": "xiaomi-token-plan-cn", "model": "mimo-v2.5-tts-voiceclone", "ctx": 8192 }, { "provider": "xiaomi-token-plan-cn", "model": "mimo-v2.5-pro", "ctx": 1048576 }, { "provider": "xiaomi-token-plan-cn", "model": "mimo-v2.5-tts-voicedesign", "ctx": 8192 }, { "provider": "xiaomi-token-plan-cn", "model": "mimo-v2.5", "ctx": 1048576 }, { "provider": "xiaomi-token-plan-cn", "model": "mimo-v2.6-pro", "ctx": 1048576 }, { "provider": "xiaomi-token-plan-sgp", "model": "mimo-v2.6-flash", "ctx": 1048576 }, { "provider": "xiaomi-token-plan-sgp", "model": "mimo-v2.6-pro", "ctx": 1048576 }, { "provider": "xiaomi-token-plan-sgp", "model": "mimo-v2.5", "ctx": 1048576 }, { "provider": "xiaomi-token-plan-sgp", "model": "mimo-v2.5-tts-voicedesign", "ctx": 8192 }, { "provider": "xiaomi-token-plan-sgp", "model": "mimo-v2.5-pro", "ctx": 1048576 }, { "provider": "xiaomi-token-plan-sgp", "model": "mimo-v2.5-tts-voiceclone", "ctx": 8192 }, { "provider": "xiaomi-token-plan-sgp", "model": "mimo-v2.5-tts", "ctx": 8192 }, { "provider": "mistral", "model": "labs-devstral-small-2512", "ctx": 256e3 }, { "provider": "mistral", "model": "labs-leanstral-1-5-1", "ctx": 262144 }, { "provider": "zai", "model": "glm-4.6v-flash", "ctx": 128e3 }, { "provider": "zai", "model": "glm-4.7-flash", "ctx": 2e5 }, { "provider": "zai", "model": "glm-4.5-flash", "ctx": 131072 }, { "provider": "vercel", "model": "recursive/flint-v1.0", "ctx": 262144 }, { "provider": "vercel", "model": "stealth/glyph-cluster", "ctx": 256e3 }, { "provider": "vercel", "model": "reflection/beam-free", "ctx": 1048576 }, { "provider": "vercel", "model": "reflection/beam", "ctx": 1048576 }, { "provider": "vercel", "model": "nvidia/nemotron-3.5-lightning-free", "ctx": 1e6 }, { "provider": "vercel", "model": "humansand/ampersand-v0.1", "ctx": 1e6 }, { "provider": "nvidia", "model": "minimaxai/minimax-m3.1-flash", "ctx": 262144 }, { "provider": "nvidia", "model": "deepseek-ai/deepseek-v4.1-flash", "ctx": 1e6 }, { "provider": "nvidia", "model": "stepfun-ai/step-5-preview", "ctx": 1048576 }, { "provider": "nvidia", "model": "z-ai/glm-5.3", "ctx": 1e6 }, { "provider": "nvidia", "model": "z-ai/glm-5.3-flash", "ctx": 1e6 }, { "provider": "nvidia", "model": "meta/llama-3.2-11b-vision-instruct", "ctx": 128e3 }, { "provider": "nvidia", "model": "meta/muse-glimmer-30b", "ctx": 131072 }, { "provider": "nvidia", "model": "meta/llama-3.2-90b-vision-instruct", "ctx": 128e3 }, { "provider": "nvidia", "model": "meta/llama-guard-4-12b", "ctx": 163840 }, { "provider": "nvidia", "model": "black-forest-labs/flux.1-dev", "ctx": 0 }, { "provider": "nvidia", "model": "black-forest-labs/flux_1-kontext-dev", "ctx": 0 }, { "provider": "nvidia", "model": "black-forest-labs/flux_2-klein-4b", "ctx": 0 }, { "provider": "nvidia", "model": "black-forest-labs/flux_1-schnell", "ctx": 0 }, { "provider": "nvidia", "model": "qwen/qwen-image", "ctx": 0 }, { "provider": "nvidia", "model": "qwen/qwen-image-edit", "ctx": 0 }, { "provider": "nvidia", "model": "mistralai/mistral-7b-instruct-v0.3", "ctx": 65536 }, { "provider": "nvidia", "model": "mistralai/mistral-medium-3-instruct", "ctx": 131072 }, { "provider": "nvidia", "model": "mistralai/magistral-small-2506", "ctx": 32768 }, { "provider": "nvidia", "model": "nvidia/llama-3.1-nemotron-70b-instruct", "ctx": 128e3 }, { "provider": "nvidia", "model": "nvidia/usdvalidate", "ctx": 0 }, { "provider": "nvidia", "model": "nvidia/nemotron-3-ultra-550b-a55b", "ctx": 1e6 }, { "provider": "nvidia", "model": "nvidia/magpie-tts-zeroshot", "ctx": 0 }, { "provider": "nvidia", "model": "nvidia/cosmos-reason2-8b", "ctx": 131072 }, { "provider": "nvidia", "model": "nvidia/nemotron-3.5-lightning-30b-a3b", "ctx": 262144 }, { "provider": "nvidia", "model": "nvidia/studiovoice", "ctx": 0 }, { "provider": "nvidia", "model": "nvidia/nemotron-voicechat", "ctx": 128e3 }, { "provider": "nvidia", "model": "nvidia/sparsedrive", "ctx": 128e3 }, { "provider": "nvidia", "model": "nvidia/nemotron-3.5-super-vl-120b-a12b", "ctx": 1048576 }, { "provider": "nvidia", "model": "nvidia/streampetr", "ctx": 128e3 }, { "provider": "nvidia", "model": "nvidia/cosmos-transfer2_5-2b", "ctx": 0 }, { "provider": "nvidia", "model": "nvidia/llama-3.1-nemotron-ultra-253b-v1", "ctx": 128e3 }, { "provider": "nvidia", "model": "nvidia/rerank-qa-mistral-4b", "ctx": 128e3 }, { "provider": "nvidia", "model": "nvidia/bevformer", "ctx": 128e3 }, { "provider": "nvidia", "model": "nvidia/llama-nemotron-embed-vl-1b-v2", "ctx": 8192 }, { "provider": "nvidia", "model": "nvidia/riva-translate-4b-instruct-v1.1", "ctx": 128e3 }, { "provider": "nvidia", "model": "nvidia/synthetic-video-detector", "ctx": 0 }, { "provider": "nvidia", "model": "nvidia/active-speaker-detection", "ctx": 0 }, { "provider": "nvidia", "model": "nvidia/llama-3.1-nemotron-safety-guard-8b-v3", "ctx": 128e3 }, { "provider": "nvidia", "model": "nvidia/llama-nemotron-rerank-vl-1b-v2", "ctx": 10240 }, { "provider": "nvidia", "model": "nvidia/nemotron-3.5-content-safety", "ctx": 128e3 }, { "provider": "nvidia", "model": "nvidia/usdcode", "ctx": 128e3 }, { "provider": "nvidia", "model": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", "ctx": 256e3 }, { "provider": "nvidia", "model": "poolside/laguna-xs-2.1", "ctx": 262144 }, { "provider": "nvidia", "model": "google/gemma-3-12b-it", "ctx": 131072 }, { "provider": "nvidia", "model": "google/gemma-4-31b-it", "ctx": 256e3 }, { "provider": "nvidia", "model": "google/gemma-3-4b-it", "ctx": 131072 }, { "provider": "nvidia", "model": "google/google-paligemma", "ctx": 128e3 }, { "provider": "nvidia", "model": "google/diffusiongemma-26b-a4b-it", "ctx": 25e4 }, { "provider": "nvidia", "model": "moonshotai/kimi-k3", "ctx": 1048576 }, { "provider": "nvidia", "model": "moonshotai/kimi-k2.6", "ctx": 262144 }, { "provider": "nvidia", "model": "openai/whisper-large-v3", "ctx": 448 }, { "provider": "nvidia", "model": "openai/gpt-oss-20b", "ctx": 131072 }, { "provider": "infomaniak", "model": "mini_lm_l12_v2", "ctx": 128 }, { "provider": "amd", "model": "GLM-5.3-Flash", "ctx": 262144 }, { "provider": "amd", "model": "DeepSeek-V4-Flash-Vision-Exp", "ctx": 1e6 }, { "provider": "amd", "model": "Qwen3.8-27B", "ctx": 262144 }, { "provider": "amd", "model": "Gemma-4-31B-IT", "ctx": 262144 }, { "provider": "amd", "model": "MiniCPM5-2B", "ctx": 131072 }, { "provider": "amd", "model": "DeepSeek-V4-Flash", "ctx": 1048576 }, { "provider": "amd", "model": "MiniCPM-V-4.7-35B-A3B", "ctx": 262144 }, { "provider": "amd", "model": "Qwen3.8-Flash-Next", "ctx": 262144 }, { "provider": "amd", "model": "DeepSeek-V4.1-Flash", "ctx": 1048576 }, { "provider": "amd", "model": "MiMo-V2.6-Flash", "ctx": 1048576 }, { "provider": "amd", "model": "MiniCPM-V-4.7-1B", "ctx": 262144 }, { "provider": "lmstudio", "model": "qwen/qwen3-30b-a3b-2507", "ctx": 262144 }, { "provider": "lmstudio", "model": "qwen/qwen3-coder-30b", "ctx": 262144 }, { "provider": "lmstudio", "model": "openai/gpt-oss-20b", "ctx": 131072 }, { "provider": "poolside", "model": "poolside/laguna-m.1", "ctx": 262144 }, { "provider": "poolside", "model": "poolside/laguna-s-2.1", "ctx": 1048576 }, { "provider": "poolside", "model": "poolside/laguna-xs-2.1", "ctx": 262144 }, { "provider": "regolo-ai", "model": "deepseek-ocr-2", "ctx": 4e3 }, { "provider": "regolo-ai", "model": "brick-v1-beta", "ctx": 1e5 }, { "provider": "regolo-ai", "model": "faster-whisper-large-v3", "ctx": 448 }, { "provider": "opencode-go", "model": "hy4-flash-free", "ctx": 1048576 }, { "provider": "opencode-go", "model": "iceman-contributor-free", "ctx": 262144 }, { "provider": "opencode-go", "model": "minimax-m3.1-flash-free", "ctx": 1e6 }, { "provider": "opencode-go", "model": "crouton-alpha-free", "ctx": 1048576 }, { "provider": "opencode-go", "model": "beam-free", "ctx": 1048576 }, { "provider": "opencode-go", "model": "cat-jam-free", "ctx": 1048576 }, { "provider": "opencode-go", "model": "longcat-2.5-free", "ctx": 1e6 }, { "provider": "opencode-go", "model": "step-5-preview-free", "ctx": 1e6 }, { "provider": "opencode-go", "model": "longcat-2.5-preview-free", "ctx": 1e6 }, { "provider": "huggingface", "model": "zai-org/GLM-4.7-Flash", "ctx": 2e5 }, { "provider": "merge-gateway", "model": "nvidia/nemotron-3.5-lightning-30b-a3b", "ctx": 1e6 }, { "provider": "alibaba-token-plan-cn", "model": "deepseek-v4-pro", "ctx": 1e6 }, { "provider": "alibaba-token-plan-cn", "model": "happyhorse-1.1-i2v", "ctx": 0 }, { "provider": "alibaba-token-plan-cn", "model": "happyhorse-1.1-r2v", "ctx": 0 }, { "provider": "alibaba-token-plan-cn", "model": "qwen3.8-max", "ctx": 1e6 }, { "provider": "alibaba-token-plan-cn", "model": "happyhorse-1.1-t2v", "ctx": 0 }, { "provider": "alibaba-token-plan-cn", "model": "qwen3.6-flash", "ctx": 1e6 }, { "provider": "alibaba-token-plan-cn", "model": "qwen3.8-max-preview", "ctx": 1e6 }, { "provider": "alibaba-token-plan-cn", "model": "qwen3.7-max", "ctx": 1e6 }, { "provider": "alibaba-token-plan-cn", "model": "glm-5", "ctx": 202752 }, { "provider": "alibaba-token-plan-cn", "model": "deepseek-v4.1-flash-1017", "ctx": 1e6 }, { "provider": "alibaba-token-plan-cn", "model": "qwen-image-2.0-pro", "ctx": 8192 }, { "provider": "alibaba-token-plan-cn", "model": "glm-5.3", "ctx": 1e6 }, { "provider": "alibaba-token-plan-cn", "model": "deepseek-v4-flash-0731", "ctx": 1e6 }, { "provider": "alibaba-token-plan-cn", "model": "wan2.7-image", "ctx": 8192 }, { "provider": "alibaba-token-plan-cn", "model": "wan2.7-image-pro", "ctx": 8192 }, { "provider": "alibaba-token-plan-cn", "model": "qwen3.6-plus", "ctx": 1e6 }, { "provider": "alibaba-token-plan-cn", "model": "deepseek-v3.2", "ctx": 131072 }, { "provider": "alibaba-token-plan-cn", "model": "deepseek-v4.1-flash", "ctx": 1e6 }, { "provider": "alibaba-token-plan-cn", "model": "qwen3.7-plus", "ctx": 1e6 }, { "provider": "alibaba-token-plan-cn", "model": "glm-5.2", "ctx": 1e6 }, { "provider": "alibaba-token-plan-cn", "model": "MiniMax-M2.5", "ctx": 196608 }, { "provider": "alibaba-token-plan-cn", "model": "deepseek-v4-flash", "ctx": 1e6 }, { "provider": "alibaba-token-plan-cn", "model": "glm-5.1", "ctx": 202752 }, { "provider": "alibaba-token-plan-cn", "model": "qwen3.8-flash", "ctx": 1e6 }, { "provider": "alibaba-token-plan-cn", "model": "kimi-k2.5", "ctx": 262144 }, { "provider": "alibaba-token-plan-cn", "model": "qwen-image-2.0", "ctx": 8192 }, { "provider": "alibaba-token-plan-cn", "model": "deepseek-v4-pro-0813", "ctx": 1e6 }, { "provider": "alibaba-token-plan-cn", "model": "kimi-k2.7-code", "ctx": 262144 }, { "provider": "alibaba-token-plan-cn", "model": "kimi-k2.6", "ctx": 262144 }, { "provider": "sensenova", "model": "deepseek-v4-pro", "ctx": 1048576 }, { "provider": "sensenova", "model": "deepseek-flash", "ctx": 1048576 }, { "provider": "sensenova", "model": "kimi-k3", "ctx": 1048576 }, { "provider": "sensenova", "model": "sensenova-6.8-flash-lite", "ctx": 262144 }, { "provider": "sensenova", "model": "glm-5.2", "ctx": 1e6 }, { "provider": "sensenova", "model": "deepseek-v4-flash", "ctx": 1e6 }, { "provider": "edenai", "model": "cohere/command-a-translate-08-2025", "ctx": 8992 }, { "provider": "edenai", "model": "cohere/command-a-vision-07-2025", "ctx": 128e3 }, { "provider": "hetzner", "model": "Qwen3.8-27B", "ctx": 262144 }, { "provider": "hetzner", "model": "Qwen/Qwen3.6-35B-A3B-FP8", "ctx": 262144 }, { "provider": "gitlab", "model": "duo-chat-gpt-5-4", "ctx": 105e4 }, { "provider": "gitlab", "model": "duo-chat-sonnet-4-5", "ctx": 2e5 }, { "provider": "gitlab", "model": "duo-chat-gpt-5-5", "ctx": 105e4 }, { "provider": "gitlab", "model": "duo-chat-gpt-5-6-sol", "ctx": 105e4 }, { "provider": "gitlab", "model": "duo-chat-gpt-5-6-luna", "ctx": 105e4 }, { "provider": "gitlab", "model": "duo-chat-opus-4-6", "ctx": 1e6 }, { "provider": "gitlab", "model": "duo-chat-opus-4-7", "ctx": 1e6 }, { "provider": "gitlab", "model": "duo-chat-gpt-6-sol", "ctx": 105e4 }, { "provider": "gitlab", "model": "duo-chat-gpt-5-4-nano", "ctx": 4e5 }, { "provider": "gitlab", "model": "duo-chat-sonnet-4-6", "ctx": 1e6 }, { "provider": "gitlab", "model": "duo-chat-sonnet-5-5", "ctx": 1e6 }, { "provider": "gitlab", "model": "duo-chat-gpt-5-1", "ctx": 4e5 }, { "provider": "gitlab", "model": "duo-chat-fable-5-1", "ctx": 1e6 }, { "provider": "gitlab", "model": "duo-chat-haiku-5-5", "ctx": 1e6 }, { "provider": "gitlab", "model": "duo-chat-gpt-5-6-terra", "ctx": 105e4 }, { "provider": "gitlab", "model": "duo-chat-gpt-6-luna", "ctx": 105e4 }, { "provider": "gitlab", "model": "duo-chat-opus-4-8", "ctx": 1e6 }, { "provider": "gitlab", "model": "duo-chat-gpt-5-3-codex", "ctx": 4e5 }, { "provider": "gitlab", "model": "duo-chat-opus-5-5", "ctx": 1e6 }, { "provider": "gitlab", "model": "duo-chat-gpt-5-4-mini", "ctx": 4e5 }, { "provider": "gitlab", "model": "duo-chat-gpt-5-codex", "ctx": 4e5 }, { "provider": "gitlab", "model": "duo-chat-opus-5", "ctx": 1e6 }, { "provider": "gitlab", "model": "duo-chat-gpt-5-2-codex", "ctx": 4e5 }, { "provider": "gitlab", "model": "duo-chat-gpt-5-mini", "ctx": 4e5 }, { "provider": "gitlab", "model": "duo-chat-gpt-5-2", "ctx": 4e5 }, { "provider": "gitlab", "model": "duo-chat-fable-5", "ctx": 1e6 }, { "provider": "gitlab", "model": "duo-chat-opus-4-5", "ctx": 2e5 }, { "provider": "gitlab", "model": "duo-chat-gpt-6-astra", "ctx": 105e4 }, { "provider": "gitlab", "model": "duo-chat-haiku-4-5", "ctx": 2e5 }, { "provider": "gitlab", "model": "duo-chat-gpt-6-1-sol", "ctx": 105e4 }, { "provider": "gitlab", "model": "duo-chat-sonnet-5", "ctx": 1e6 }, { "provider": "bothub", "model": "gemma-4-31b-it:free", "ctx": 262144 }, { "provider": "bothub", "model": "nemotron-3-ultra-550b-a55b:free", "ctx": 1e6 }, { "provider": "unorouter", "model": "glm-4.5-flash:free", "ctx": 131072 }, { "provider": "unorouter", "model": "gpt-5.5:free", "ctx": 105e4 }, { "provider": "unorouter", "model": "deepseek-v4-pro:free", "ctx": 1e6 }, { "provider": "unorouter", "model": "qwen3.5-397b-a17b:free", "ctx": 262144 }, { "provider": "unorouter", "model": "minimax-m2.7:free", "ctx": 204800 }, { "provider": "unorouter", "model": "step-3.7-flash:free", "ctx": 256e3 }, { "provider": "unorouter", "model": "glm-5.2:free", "ctx": 1e6 }, { "provider": "unorouter", "model": "deepseek-v4-flash:free", "ctx": 1e6 }, { "provider": "unorouter", "model": "gemma-4-31b-it:free", "ctx": 262144 }, { "provider": "unorouter", "model": "gpt-5.4:free", "ctx": 105e4 }, { "provider": "unorouter", "model": "nemotron-3-ultra-550b-a55b:free", "ctx": 1e6 }, { "provider": "alibaba-coding-plan", "model": "qwen3-max-2026-01-23", "ctx": 262144 }, { "provider": "alibaba-coding-plan", "model": "glm-5", "ctx": 202752 }, { "provider": "alibaba-coding-plan", "model": "qwen3.5-plus", "ctx": 1e6 }, { "provider": "alibaba-coding-plan", "model": "glm-4.7", "ctx": 202752 }, { "provider": "alibaba-coding-plan", "model": "qwen3-coder-plus", "ctx": 1e6 }, { "provider": "alibaba-coding-plan", "model": "qwen3.6-plus", "ctx": 1e6 }, { "provider": "alibaba-coding-plan", "model": "qwen3.7-plus", "ctx": 1e6 }, { "provider": "alibaba-coding-plan", "model": "MiniMax-M2.5", "ctx": 196608 }, { "provider": "alibaba-coding-plan", "model": "kimi-k2.5", "ctx": 262144 }, { "provider": "alibaba-coding-plan", "model": "qwen3-coder-next", "ctx": 262144 }, { "provider": "requesty", "model": "nemotron-3-ultra-550b-a55b", "ctx": 1048576 }, { "provider": "requesty", "model": "muse-glimmer-30b", "ctx": 131072 }, { "provider": "requesty", "model": "leanstral-1-5@eu", "ctx": 262144 }, { "provider": "requesty", "model": "nemotron-3.5-lightning-30b-a3b", "ctx": 1048576 }, { "provider": "requesty", "model": "gemma-4-31b-it", "ctx": 262144 }, { "provider": "requesty", "model": "leanstral-1-5", "ctx": 262144 }, { "provider": "requesty", "model": "nemotron-3-nano-omni-30b-a3b-reasoning", "ctx": 131072 }, { "provider": "umans-ai-coding-plan", "model": "umans-kimi-k3.1-pro", "ctx": 1048576 }, { "provider": "umans-ai-coding-plan", "model": "umans-kimi-k3", "ctx": 1048576 }, { "provider": "umans-ai-coding-plan", "model": "umans-coder", "ctx": 1048576 }, { "provider": "umans-ai-coding-plan", "model": "umans-flash", "ctx": 262144 }, { "provider": "umans-ai-coding-plan", "model": "umans-deepseek-v4-flash-0731", "ctx": 1048576 }, { "provider": "umans-ai-coding-plan", "model": "umans-glm-5.3-flash", "ctx": 1048576 }, { "provider": "umans-ai-coding-plan", "model": "umans-deepseek-v4.1-flash-1017", "ctx": 1048576 }, { "provider": "umans-ai-coding-plan", "model": "umans-qwen3.6-35b-a3b", "ctx": 262144 }, { "provider": "umans-ai-coding-plan", "model": "umans-deepseek-v4.1-flash", "ctx": 1048576 }, { "provider": "umans-ai-coding-plan", "model": "umans-glm-5.3", "ctx": 1048576 }, { "provider": "iteracompute", "model": "qwen/qwen3.8-27b", "ctx": 131072 }, { "provider": "google", "model": "lyria-3-pro-preview", "ctx": 1048576 }, { "provider": "google", "model": "gemma-4-26b-a4b-it", "ctx": 262144 }, { "provider": "google", "model": "lyria-3-clip-preview", "ctx": 1048576 }, { "provider": "google", "model": "gemma-4-31b-it", "ctx": 262144 }, { "provider": "siliconflow-cn", "model": "deepseek-ai/DeepSeek-OCR", "ctx": 8192 }, { "provider": "siliconflow-cn", "model": "PaddlePaddle/PaddleOCR-VL-1.5", "ctx": 16384 }, { "provider": "siliconflow-cn", "model": "Qwen/Qwen2.5-7B-Instruct", "ctx": 33e3 }, { "provider": "siliconflow-cn", "model": "Qwen/Qwen3-8B", "ctx": 131e3 }, { "provider": "siliconflow-cn", "model": "Qwen/Qwen3.5-4B", "ctx": 262144 }, { "provider": "volcengine-coding-plan", "model": "kimi-k2.8-preview", "ctx": 1048576 }, { "provider": "volcengine-coding-plan", "model": "deepseek-v4-pro", "ctx": 1e6 }, { "provider": "volcengine-coding-plan", "model": "minimax-m3", "ctx": 1048576 }, { "provider": "volcengine-coding-plan", "model": "doubao-seed-2.0-mini", "ctx": 256e3 }, { "provider": "volcengine-coding-plan", "model": "glm-5.3", "ctx": 1e6 }, { "provider": "volcengine-coding-plan", "model": "deepseek-v4.1-flash-economy", "ctx": 1e6 }, { "provider": "volcengine-coding-plan", "model": "kimi-k3", "ctx": 1048576 }, { "provider": "volcengine-coding-plan", "model": "doubao-seed-2.1-turbo", "ctx": 256e3 }, { "provider": "volcengine-coding-plan", "model": "doubao-seed-2.1-pro", "ctx": 1024e3 }, { "provider": "volcengine-coding-plan", "model": "doubao-seed-2.0-lite", "ctx": 256e3 }, { "provider": "volcengine-coding-plan", "model": "doubao-seed-2.1-lite", "ctx": 1024e3 }, { "provider": "volcengine-coding-plan", "model": "deepseek-v4.1-flash", "ctx": 1e6 }, { "provider": "volcengine-coding-plan", "model": "doubao-seed-evolving", "ctx": 1024e3 }, { "provider": "volcengine-coding-plan", "model": "deepseek-v4-flash", "ctx": 1e6 }, { "provider": "volcengine-coding-plan", "model": "kimi-k3.1-pro", "ctx": 1048576 }, { "provider": "volcengine-coding-plan", "model": "glm-5.3-flash", "ctx": 1e6 }, { "provider": "volcengine-coding-plan", "model": "kimi-k2.7-code", "ctx": 262144 }, { "provider": "atomic-chat", "model": "gemma-4-E4B-it-MLX-4bit", "ctx": 32768 }, { "provider": "atomic-chat", "model": "Qwen3_5-9B-Q4_K_M", "ctx": 32768 }, { "provider": "atomic-chat", "model": "Meta-Llama-3_1-8B-Instruct-GGUF", "ctx": 131072 }, { "provider": "atomic-chat", "model": "Qwen3_5-9B-MLX-4bit", "ctx": 32768 }, { "provider": "atomic-chat", "model": "gemma-4-E4B-it-IQ4_XS", "ctx": 32768 }, { "provider": "llmgateway", "model": "gpt-transcribe", "ctx": 0 }, { "provider": "llmgateway", "model": "gpt-live-transcribe", "ctx": 0 }, { "provider": "llmgateway", "model": "auto", "ctx": 128e3 }, { "provider": "llmgateway", "model": "custom", "ctx": 128e3 }, { "provider": "llmgateway-providers", "model": "azure/gpt-transcribe", "ctx": 0 }, { "provider": "llmgateway-providers", "model": "azure/gpt-live-transcribe", "ctx": 0 }, { "provider": "llmgateway-providers", "model": "openai/gpt-transcribe", "ctx": 0 }, { "provider": "llmgateway-providers", "model": "openai/gpt-live-transcribe", "ctx": 0 }, { "provider": "llmtr", "model": "poolside/laguna-xs-2.1", "ctx": 262144 }, { "provider": "inferall", "model": "z-ai/glm-5.3", "ctx": 1e6 }, { "provider": "inferall", "model": "z-ai/glm-5.3-flash", "ctx": 1e6 }, { "provider": "inferall", "model": "nvidia/nemotron-3-ultra-550b-a55b", "ctx": 1e6 }, { "provider": "inferall", "model": "nvidia/nemotron-3.5-lightning-30b-a3b", "ctx": 262144 }, { "provider": "inferall", "model": "nvidia/nemotron-3.5-super-vl-120b-a12b", "ctx": 1048576 }, { "provider": "inferall", "model": "openai/gpt-oss-20b", "ctx": 131072 }, { "provider": "scnet-token-plan", "model": "GLM-5.3-Flash", "ctx": 1e6 }, { "provider": "scnet-token-plan", "model": "MiniMax-M3", "ctx": 1048576 }, { "provider": "scnet-token-plan", "model": "DeepSeek-V4-Flash", "ctx": 1e6 }, { "provider": "scnet-token-plan", "model": "Qwen3.8-Flash", "ctx": 1e6 }, { "provider": "scnet-token-plan", "model": "Kimi-K2.5", "ctx": 262144 }, { "provider": "scnet-token-plan", "model": "GLM-5.1", "ctx": 2e5 }, { "provider": "scnet-token-plan", "model": "DeepSeek-V4.1-Flash", "ctx": 1e6 }, { "provider": "scnet-token-plan", "model": "MiniMax-M2.7", "ctx": 204800 }, { "provider": "scnet-token-plan", "model": "Kimi-K3", "ctx": 1048576 }, { "provider": "scnet-token-plan", "model": "Kimi-K2.7-Code", "ctx": 262144 }, { "provider": "scnet-token-plan", "model": "MiniMax-M2.5", "ctx": 204800 }, { "provider": "scnet-token-plan", "model": "Kimi-K2.6", "ctx": 262144 }, { "provider": "scnet-token-plan", "model": "DeepSeek-V4-Pro-0813", "ctx": 1e6 }, { "provider": "scnet-token-plan", "model": "GLM-5", "ctx": 204800 }, { "provider": "scnet-token-plan", "model": "DeepSeek-V4-Pro", "ctx": 1e6 }, { "provider": "scnet-token-plan", "model": "GLM-5.2", "ctx": 1e6 }, { "provider": "scnet-token-plan", "model": "Qwen3.8-Max", "ctx": 1e6 }, { "provider": "scnet-token-plan", "model": "GLM-5.3", "ctx": 1e6 }, { "provider": "scnet-token-plan", "model": "DeepSeek-V4-Flash-0731", "ctx": 1e6 }, { "provider": "kimi-code-plan-cn", "model": "k3.1-pro", "ctx": 1048576 }, { "provider": "kimi-code-plan-cn", "model": "k3.1-pro-highspeed", "ctx": 1048576 }, { "provider": "kimi-code-plan-cn", "model": "kimi-for-coding-highspeed", "ctx": 262144 }, { "provider": "kimi-code-plan-cn", "model": "k3", "ctx": 1048576 }, { "provider": "kimi-code-plan-cn", "model": "k3-256k", "ctx": 262144 }, { "provider": "kimi-code-plan-cn", "model": "kimi-for-coding", "ctx": 1048576 }, { "provider": "tencent-token-plan", "model": "hy3", "ctx": 256e3 }, { "provider": "tokenrouter", "model": "z-ai/glm-5.3-free", "ctx": 1e6 }, { "provider": "opencode", "model": "deepseek-v4.1-flash-free", "ctx": 2e5 }, { "provider": "opencode", "model": "mimo-v2-omni-free", "ctx": 262144 }, { "provider": "opencode", "model": "tidepool-alpha-free", "ctx": 1048576 }, { "provider": "opencode", "model": "nemotron-3-super-free", "ctx": 204800 }, { "provider": "opencode", "model": "mimo-v2.6-flash-free", "ctx": 2e5 }, { "provider": "opencode", "model": "hy3-free", "ctx": 19e4 }, { "provider": "opencode", "model": "exo-free", "ctx": 1048576 }, { "provider": "opencode", "model": "big-pickle", "ctx": 2e5 }, { "provider": "opencode", "model": "ling-2.6-flash-free", "ctx": 262100 }, { "provider": "opencode", "model": "fledge-alpha-free", "ctx": 1048576 }, { "provider": "opencode", "model": "glm-5.3-flash-free", "ctx": 2e5 }, { "provider": "opencode", "model": "hy4-flash-free", "ctx": 1048576 }, { "provider": "opencode", "model": "ring-2.6-1t-free", "ctx": 262e3 }, { "provider": "opencode", "model": "longcat-2.0-free", "ctx": 1e6 }, { "provider": "opencode", "model": "trinity-large-preview-free", "ctx": 131072 }, { "provider": "opencode", "model": "ling-3.0-tiny-free", "ctx": 262144 }, { "provider": "opencode", "model": "flint-40b-free", "ctx": 262144 }, { "provider": "opencode", "model": "hy3-preview-free", "ctx": 256e3 }, { "provider": "opencode", "model": "space-bunny-free", "ctx": 1048576 }, { "provider": "opencode", "model": "minimax-m3.1-flash-free", "ctx": 1e6 }, { "provider": "opencode", "model": "mimo-v2.5-free", "ctx": 2e5 }, { "provider": "opencode", "model": "glm-5-free", "ctx": 204800 }, { "provider": "opencode", "model": "north-mini-code-free", "ctx": 256e3 }, { "provider": "opencode", "model": "grok-code", "ctx": 256e3 }, { "provider": "opencode", "model": "laguna-s-2.1-free", "ctx": 256e3 }, { "provider": "opencode", "model": "minimax-m3-free", "ctx": 2e5 }, { "provider": "opencode", "model": "crouton-alpha-free", "ctx": 1048576 }, { "provider": "opencode", "model": "beam-free", "ctx": 1048576 }, { "provider": "opencode", "model": "mimo-v2-pro-free", "ctx": 1048576 }, { "provider": "opencode", "model": "ling-3.1-flash-free", "ctx": 262144 }, { "provider": "opencode", "model": "minimax-m2.1-free", "ctx": 204800 }, { "provider": "opencode", "model": "ling-3.0-flash-free", "ctx": 262144 }, { "provider": "opencode", "model": "qwen3.6-plus-free", "ctx": 262144 }, { "provider": "opencode", "model": "x-preview-f-free", "ctx": 1e6 }, { "provider": "opencode", "model": "cat-jam-free", "ctx": 1048576 }, { "provider": "opencode", "model": "iceman-free", "ctx": 262144 }, { "provider": "opencode", "model": "longcat-2.5-free", "ctx": 1e6 }, { "provider": "opencode", "model": "inkling-2-small-free", "ctx": 1048576 }, { "provider": "opencode", "model": "nemotron-3.5-super-vl-free", "ctx": 1048576 }, { "provider": "opencode", "model": "muse-spark-1.2-contributor-free", "ctx": 1048576 }, { "provider": "opencode", "model": "pulse-alpha-free", "ctx": 1048576 }, { "provider": "opencode", "model": "nemotron-3.5-lightning-free", "ctx": 262144 }, { "provider": "opencode", "model": "glm-4.7-free", "ctx": 204800 }, { "provider": "opencode", "model": "minimax-m2.5-free", "ctx": 204800 }, { "provider": "opencode", "model": "step-5-preview-free", "ctx": 1e6 }, { "provider": "opencode", "model": "mimo-v2-flash-free", "ctx": 262144 }, { "provider": "opencode", "model": "muse-spark-1.3-contributor-free", "ctx": 1048576 }, { "provider": "opencode", "model": "ling-3.0-flash-fin-free", "ctx": 262144 }, { "provider": "opencode", "model": "ll-alpha-free", "ctx": 262144 }, { "provider": "opencode", "model": "kimi-k2.5-free", "ctx": 262144 }, { "provider": "opencode", "model": "deepseek-v4-flash-free", "ctx": 2e5 }, { "provider": "opencode", "model": "longcat-2.5-preview-free", "ctx": 1e6 }, { "provider": "opencode", "model": "nemotron-3-ultra-free", "ctx": 1e6 }, { "provider": "lynkr", "model": "lynkr-auto", "ctx": 128e3 }];
var ZERO_MIX_CHAIN = ZERO_COST_MODELS.map((m) => `${m.provider}/${m.model}`);

// src/router/core.ts
var ENV_KEY_NAMES = {
  openrouter: "OPENROUTER_API_KEY",
  nvidia: "NVIDIA_API_KEY",
  huggingface: "HF_TOKEN",
  chutes: "CHUTES_API_KEY",
  sambanova: "SAMBANOVA_API_KEY",
  groq: "GROQ_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  gemini: "GEMINI_API_KEY",
  cloudflare: "CLOUDFLARE_API_TOKEN",
  deepinfra: "DEEPINFRA_API_KEY",
  novita: "NOVITA_API_KEY",
  mistral: "MISTRAL_API_KEY",
  zhipu: "ZHIPU_API_KEY",
  modelscope: "MODELSCOPE_API_KEY",
  tiprouter: "TIPROUTER_API_KEY"
};
async function pickKey(providerId) {
  if (PROVIDERS_BY_ID.get(providerId)?.keyless) return null;
  if (!env.isDemo) {
    const rows = await db().select().from(providerKeys).where(and2(eq3(providerKeys.providerId, providerId), eq3(providerKeys.status, "active"))).orderBy(asc(providerKeys.lastUsedAt)).limit(1);
    if (rows.length > 0) {
      return openKeyCached({
        id: rows[0].id,
        ciphertext: rows[0].ciphertext,
        iv: rows[0].iv,
        keyVersion: rows[0].keyVersion,
        providerId
      });
    }
  }
  const envName = ENV_KEY_NAMES[providerId];
  const value = envName ? process.env[envName]?.trim() : "";
  return value || null;
}
var ALIAS_CHAINS = {
  auto: AUTO_CHAIN.map((n) => `${n.provider}/${n.family}`),
  all: ZERO_MIX_CHAIN,
  fast: ["groq/llama-3.3-70b", "cerebras/gpt-oss-120b", "nvidia/gemma-4-31b-it"],
  smart: ["nvidia/glm-5.3", "chutes/kimi-k3.1-pro", "huggingface/qwen3.8-27b"],
  vision: ["nvidia/gemma-4-31b-it", "gemini/gemini-3.5-flash-lite"],
  tiptip: [
    "tiprouter/qwen3.8-flash",
    "tiprouter/mimo-v2.6.flash",
    "tiprouter/step-3.7-flash",
    "tiprouter/qwen3.8-flash-uncen",
    "tiprouter/deepseek-v4.1-flash-1017-uncen",
    "tiprouter/nemotron-3.5-super",
    "tiprouter/deepseek-v-4.1-flash-1017",
    "tiprouter/deepseek-v4.1-flash-1017",
    "tiprouter/gpt-6-luna",
    "tiprouter/qwen-3.8-27b",
    "tiprouter/dots-3-note-preview",
    "tiprouter/deepseek-v4-flash-0731",
    "tiprouter/solar-mini4",
    "tiprouter/qwen4-max"
  ]
};
function fromDemoTable(requested) {
  const alias = ALIAS_CHAINS[requested];
  if (alias) {
    return alias.map((entry) => {
      const [providerId, family] = entry.split("/");
      return { providerId, family, upstreamId: family };
    }).filter((c) => PROVIDERS_BY_ID.has(c.providerId));
  }
  if (requested.includes("/")) {
    const [providerId, ...rest] = requested.split("/");
    const family = rest.join("/");
    if (PROVIDERS_BY_ID.has(providerId)) return [{ providerId, family, upstreamId: family }];
  }
  const row = MODEL_ROWS.find((m) => m.family === requested);
  if (row) {
    return row.providers.map((providerId) => ({ providerId, family: row.family, upstreamId: row.family }));
  }
  return [];
}
async function resolveRaw(requested) {
  if (env.isDemo) return fromDemoTable(requested);
  const aliasChain = ALIAS_CHAINS[requested];
  if (aliasChain) {
    return aliasChain.map((entry) => {
      const [providerId, family] = entry.split("/");
      return { providerId, family, upstreamId: family };
    }).filter((c) => PROVIDERS_BY_ID.has(c.providerId));
  }
  if (requested.includes("/")) {
    const [providerId, ...rest] = requested.split("/");
    const upstreamId = rest.join("/");
    const rows2 = await db().select().from(models).where(and2(eq3(models.providerId, providerId), eq3(models.upstreamId, upstreamId), eq3(models.enabled, true))).limit(1);
    if (rows2.length > 0) {
      return [{ providerId, family: rows2[0].family, upstreamId }];
    }
  }
  const rows = await db().select().from(models).where(and2(eq3(models.family, requested), eq3(models.enabled, true)));
  return rows.map((row) => ({
    providerId: row.providerId,
    family: row.family,
    upstreamId: row.upstreamId
  }));
}
var DEMO_P95 = new Map(PROVIDER_USAGE.map((p) => [p.id, p.p95]));
var DEMO_LEFT = new Map(AUTO_CHAIN.map((n) => [n.provider, n.left]));
async function resolveCandidates(requested) {
  const raw5 = await resolveRaw(requested);
  if (raw5.length === 0) return [];
  const providerIds = [...new Set(raw5.map((c) => c.providerId))];
  const counters = await loadCounters(providerIds);
  const limits = await loadLimits(providerIds);
  const built = raw5.map((c) => {
    const provider = PROVIDERS_BY_ID.get(c.providerId);
    if (!provider) return null;
    const limit = limits.get(c.providerId) ?? {
      maxRequests: env.isDemo ? PROVIDER_USAGE.find((p) => p.id === c.providerId)?.limit ?? null : null,
      maxTokens: null
    };
    const counter = counters.get(c.providerId)?.day ?? { requests: 0, tokens: 0 };
    return {
      providerId: c.providerId,
      provider,
      family: c.family,
      upstreamId: c.upstreamId,
      left: remaining(limit, counter)
    };
  }).filter((c) => c !== null);
  const headroom = env.isDemo || limits.size > 0 ? built.filter((c) => {
    const limit = limits.get(c.providerId) ?? {
      maxRequests: PROVIDER_USAGE.find((p) => p.id === c.providerId)?.limit ?? null,
      maxTokens: null
    };
    const counter = counters.get(c.providerId)?.day ?? { requests: 0, tokens: 0 };
    return hasHeadroom(limit, counter);
  }) : built;
  const pool = headroom.length > 0 ? headroom : built;
  return pool.sort((a, b) => {
    const aLeft = a.left ?? Number.MAX_SAFE_INTEGER;
    const bLeft = b.left ?? Number.MAX_SAFE_INTEGER;
    if (aLeft !== bLeft) return bLeft - aLeft;
    const aP95 = DEMO_P95.get(a.providerId) ?? 1e3;
    const bP95 = DEMO_P95.get(b.providerId) ?? 1e3;
    return aP95 - bP95;
  });
}
async function routeChat(rawBody, signal) {
  const requested = typeof rawBody?.model === "string" ? rawBody.model : "auto";
  const candidates = await resolveCandidates(requested);
  const attempts = [];
  if (candidates.length === 0) {
    return {
      ok: false,
      status: 404,
      code: "model_not_found",
      detail: `No enabled provider serves "${requested}".`,
      attempts
    };
  }
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  let last = null;
  for (let index2 = 0; index2 < candidates.length; index2++) {
    const candidate = candidates[index2];
    const started = Date.now();
    let apiKey;
    try {
      apiKey = await pickKey(candidate.providerId);
    } catch (err) {
      attempts.push({
        providerId: candidate.providerId,
        family: candidate.family,
        status: 500,
        code: "key_unavailable",
        ms: Date.now() - started
      });
      continue;
    }
    if (!apiKey && !candidate.provider.keyless) {
      attempts.push({
        providerId: candidate.providerId,
        family: candidate.family,
        status: 401,
        code: "no_key",
        ms: Date.now() - started
      });
      continue;
    }
    const upstreamBody = {
      ...rawBody,
      model: candidate.upstreamId,
      // Ask for usage in the trailing SSE frame so accounting does not guess.
      stream_options: rawBody?.stream ? { include_usage: true } : void 0
    };
    const result = await callChatCompletions({
      provider: candidate.provider,
      apiKey,
      body: upstreamBody,
      accountId,
      signal
    });
    const ms = Date.now() - started;
    if (result.ok) {
      attempts.push({
        providerId: candidate.providerId,
        family: candidate.family,
        status: 200,
        code: "ok",
        ms
      });
      return {
        ok: true,
        response: result.response,
        candidate,
        fallbacks: index2,
        attempts
      };
    }
    last = {
      providerId: candidate.providerId,
      family: candidate.family,
      status: result.status,
      code: result.code,
      ms
    };
    attempts.push(last);
    if (!isRetryable(result.status)) break;
  }
  return {
    ok: false,
    status: last?.status ?? 503,
    code: last?.code ?? "no_candidate",
    detail: `All ${attempts.length} candidate(s) failed. Last: ${last?.providerId ?? "none"} ${last?.code ?? ""}`,
    attempts
  };
}

// src/models/sync.ts
init_env();
function familyOf(upstreamId) {
  return upstreamId.replace(/^.*\//, "").split(":")[0].toLowerCase();
}
async function syncCatalog(resolveKey) {
  const results = [];
  for (const provider of PROVIDERS) {
    let apiKey = null;
    if (!provider.keyless) {
      apiKey = await resolveKey(provider.id);
      if (!apiKey) {
        results.push({ provider: provider.id, ok: false, error: "no key" });
        continue;
      }
    }
    try {
      const listed = await listModels(
        provider,
        apiKey,
        process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || void 0
      );
      if (listed.length === 0) {
        results.push({ provider: provider.id, ok: false, error: "empty catalog" });
        continue;
      }
      if (!env.isDemo) {
        await db().insert(providers).values({
          id: provider.id,
          name: provider.name,
          baseUrl: provider.baseUrl,
          adapter: provider.adapter,
          note: provider.note
        }).onConflictDoNothing();
        const now = /* @__PURE__ */ new Date();
        for (const entry of listed) {
          await db().insert(models).values({
            id: `${provider.id}:${entry.id}`,
            providerId: provider.id,
            upstreamId: entry.id,
            family: familyOf(entry.id),
            displayName: entry.id,
            contextLen: entry.contextLength ?? null,
            isFree: true,
            enabled: true,
            lastSyncedAt: now
          }).onConflictDoUpdate({
            target: models.id,
            set: {
              displayName: entry.id,
              contextLen: entry.contextLength ?? null,
              lastSyncedAt: now,
              enabled: true
            }
          });
        }
      }
      results.push({ provider: provider.id, ok: true, count: listed.length });
    } catch (err) {
      results.push({ provider: provider.id, ok: false, error: err.message.slice(0, 160) });
    }
  }
  return results;
}

// src/data/index.ts
import { and as and3, count, desc, eq as eq4, gte as gte2, inArray as inArray2, sql } from "drizzle-orm";
init_env();
function bucketStart2(kind, now = /* @__PURE__ */ new Date()) {
  const d = new Date(now);
  if (kind === "minute") {
    d.setUTCSeconds(0, 0);
    return d;
  }
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
function toNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function demo() {
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
    nearCap: NEAR_CAP
  };
}
async function loadDashboard() {
  if (env.isDemo) return demo();
  const dayStart = bucketStart2("day");
  const now = /* @__PURE__ */ new Date();
  const currentHour = now.getUTCHours();
  const providerRows = await db().select().from(providers).where(eq4(providers.enabled, true));
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
    aliasRows
  ] = await Promise.all([
    db().select({
      providerId: quotaBuckets.providerId,
      requests: sql`sum(${quotaBuckets.requests})`,
      tokens: sql`sum(${quotaBuckets.tokens})`
    }).from(quotaBuckets).where(and3(inArray2(quotaBuckets.providerId, providerIds), eq4(quotaBuckets.modelId, ""), gte2(quotaBuckets.bucketStart, dayStart))).groupBy(quotaBuckets.providerId),
    db().select({ providerId: quotaLimits.providerId, maxRequests: quotaLimits.maxRequests }).from(quotaLimits).where(and3(inArray2(quotaLimits.providerId, providerIds), eq4(quotaLimits.modelId, ""), eq4(quotaLimits.bucketKind, "day"))),
    db().select({ providerId: providerKeys.providerId, keys: count(), keyHint: providerKeys.keyHint, lastUsedAt: providerKeys.lastUsedAt }).from(providerKeys).where(and3(inArray2(providerKeys.providerId, providerIds), eq4(providerKeys.status, "active"))).groupBy(providerKeys.providerId, providerKeys.keyHint, providerKeys.lastUsedAt),
    db().select({ modelId: modelHealth.modelId, p95Ms: sql`avg(${modelHealth.p95Ms})` }).from(modelHealth).where(gte2(modelHealth.windowStart, dayStart)).groupBy(modelHealth.modelId),
    db().select({
      id: requestLog.id,
      ts: requestLog.ts,
      alias: requestLog.alias,
      modelId: requestLog.modelId,
      status: requestLog.status,
      latencyMs: requestLog.latencyMs,
      promptTokens: requestLog.promptTokens,
      completionTokens: requestLog.completionTokens,
      fallbacks: requestLog.fallbacks
    }).from(requestLog).where(gte2(requestLog.ts, dayStart)).orderBy(desc(requestLog.ts)).limit(12),
    db().select({
      family: models.family,
      providerId: models.providerId,
      contextK: models.contextLen,
      tools: models.supportsTools,
      vision: models.supportsVision,
      served: sql`coalesce((
          select sum(${quotaBuckets.requests})
          from ${quotaBuckets}
          where ${quotaBuckets.providerId} = ${models.providerId}
            and ${quotaBuckets.modelId} = ${models.family}
            and ${quotaBuckets.bucketKind} = 'day'
            and ${quotaBuckets.bucketStart} >= ${dayStart}
        ), 0)`
    }).from(models).where(eq4(models.enabled, true)),
    db().select({
      hour: sql`extract(hour from ${quotaBuckets.bucketStart})`,
      requests: sql`sum(${quotaBuckets.requests})`,
      tokens: sql`sum(${quotaBuckets.tokens})`
    }).from(quotaBuckets).where(gte2(quotaBuckets.bucketStart, dayStart)).groupBy(sql`extract(hour from ${quotaBuckets.bucketStart})`),
    db().select({ value: sql`count(*)` }).from(requestLog).where(and3(gte2(requestLog.ts, dayStart), eq4(requestLog.status, 429))),
    db().select().from(aliases).where(eq4(aliases.name, "auto")).limit(1)
  ]);
  const counterMap = new Map(counterRows.map((row) => [row.providerId, { requests: toNumber(row.requests), tokens: toNumber(row.tokens) }]));
  const limitMap = new Map(limitRows.map((row) => [row.providerId, row.maxRequests ?? null]));
  const keyMap = /* @__PURE__ */ new Map();
  for (const row of keyRows) {
    const age = row.lastUsedAt ? `${Math.max(1, Math.round((Date.now() - new Date(row.lastUsedAt).getTime()) / 864e5))}d ago` : "today";
    keyMap.set(row.providerId, { keys: toNumber(row.keys), keyHint: row.keyHint ?? null, age });
  }
  const p95Map = /* @__PURE__ */ new Map();
  for (const row of healthRows) {
    const providerId = row.modelId.split("/")[0];
    if (!p95Map.has(providerId)) p95Map.set(providerId, toNumber(row.p95Ms));
  }
  const logStats = /* @__PURE__ */ new Map();
  for (const row of logRows) {
    const providerId = row.alias ?? row.modelId?.split("/")[0] ?? "router";
    const current = logStats.get(providerId) ?? { requests: 0, rateLimited: 0 };
    current.requests += 1;
    if (row.status === 429) current.rateLimited += 1;
    logStats.set(providerId, current);
  }
  const usage = providerRows.map((provider) => {
    const counter = counterMap.get(provider.id) ?? { requests: 0, tokens: 0 };
    const limit = limitMap.get(provider.id) ?? null;
    const keyInfo = keyMap.get(provider.id) ?? { keys: 0, keyHint: null, age: "no key" };
    const stats = logStats.get(provider.id) ?? { requests: 0, rateLimited: 0 };
    const used = counter.requests;
    const status = stats.rateLimited > 0 ? "degraded" : limit !== null && limit > 0 && used / limit >= 0.8 ? "warn" : keyInfo.keys === 0 && !provider.note?.toLowerCase().includes("keyless") ? "off" : "ok";
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
      note: provider.note ?? ""
    };
  });
  const familyMap = /* @__PURE__ */ new Map();
  for (const row of modelRows) {
    const current = familyMap.get(row.family) ?? { providers: /* @__PURE__ */ new Set(), contextK: 0, tools: false, vision: false, served: 0 };
    current.providers.add(row.providerId);
    current.served += toNumber(row.served);
    current.tools = current.tools || row.tools;
    current.vision = current.vision || row.vision;
    if ((row.contextK ?? 0) > current.contextK) current.contextK = row.contextK ?? 0;
    familyMap.set(row.family, current);
  }
  const liveModels = Array.from(familyMap.entries()).map(([family, data]) => ({
    family,
    providers: Array.from(data.providers),
    contextK: data.contextK,
    tools: data.tools,
    vision: data.vision,
    served: data.served
  })).sort((a, b) => b.served - a.served);
  const requests = logRows.map((row, index2) => ({
    id: row.id,
    minutesAgo: Math.max(0, Math.round((now.getTime() - new Date(row.ts).getTime()) / 6e4)),
    family: row.alias ?? row.modelId?.split("/").slice(1).join("/") ?? "unknown",
    provider: row.modelId?.split("/")[0] ?? row.alias ?? "router",
    status: row.status,
    ms: row.latencyMs ?? 0,
    tokens: toNumber(row.promptTokens) + toNumber(row.completionTokens),
    fallbacks: row.fallbacks ?? 0
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
  const chain = chainSource.map((entry) => {
    const [providerId, family] = entry.split("/");
    const limit = limitMap.get(providerId) ?? null;
    const counter = chainCounters.get(providerId) ?? 0;
    const left = limit !== null ? Math.max(0, limit - counter) : counter;
    const state = limit !== null && counter >= limit ? "exhausted" : limit !== null && left <= 20 ? "cooling" : "live";
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
    hourLabels: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`),
    weightedP95,
    modelFamilies: liveModels.length,
    modelEndpoints: liveModels.reduce((a, m) => a + m.providers.length, 0),
    modelServed: liveModels.reduce((a, m) => a + m.served, 0),
    modelLongest: liveModels.reduce((a, m) => Math.max(a, m.contextK), 0),
    chainTotal: chain.reduce((a, n) => a + n.left, 0),
    chainLive: chain.filter((n) => n.state === "live").length,
    nearCap
  };
}

// src/ui/layout.tsx
import { raw } from "hono/html";
import { Fragment, jsx, jsxs } from "hono/jsx/jsx-runtime";
var ICONS = {
  overview: '<path d="M3 6h18M3 12h12M3 18h6"/>',
  models: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  providers: '<circle cx="12" cy="5" r="2.4"/><circle cx="5" cy="18" r="2.4"/><circle cx="19" cy="18" r="2.4"/><path d="M12 7.4v3.8M12 11.2L6.6 15.9M12 11.2l5.4 4.7"/>',
  playground: '<path d="M8 5l10 7-10 7V5z"/>',
  usage: '<path d="M3 17l5-6 4 3 6-8"/>',
  endpoint: '<path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M8 12h8M8 16h5"/>'
};
var NAV = [
  { id: "overview", href: "/", label: "Overview" },
  { id: "models", href: "/models", label: "Models" },
  { id: "providers", href: "/providers", label: "Providers" },
  { id: "playground", href: "/playground", label: "Playground" },
  { id: "endpoint", href: "/endpoint", label: "Endpoint" },
  { id: "usage", href: "/usage", label: "Usage" }
];
var Icon = ({ id }) => /* @__PURE__ */ jsx("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: raw(ICONS[id]) });
var Layout = (props) => /* @__PURE__ */ jsxs(Fragment, { children: [
  raw("<!DOCTYPE html>"),
  /* @__PURE__ */ jsxs("html", { lang: "en", children: [
    /* @__PURE__ */ jsxs("head", { children: [
      /* @__PURE__ */ jsx("meta", { charset: "utf-8" }),
      /* @__PURE__ */ jsx("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
      /* @__PURE__ */ jsxs("title", { children: [
        props.title,
        " \xB7 Router"
      ] }),
      /* @__PURE__ */ jsx("link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }),
      /* @__PURE__ */ jsx("meta", { name: "theme-color", content: "#1d5fbf" }),
      /* @__PURE__ */ jsx("meta", { name: "color-scheme", content: "light" }),
      /* @__PURE__ */ jsx("link", { rel: "preconnect", href: "https://fonts.googleapis.com" }),
      /* @__PURE__ */ jsx("link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "anonymous" }),
      /* @__PURE__ */ jsx(
        "link",
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&family=Geist+Mono:wght@400;500&display=swap"
        }
      ),
      /* @__PURE__ */ jsx("link", { rel: "stylesheet", href: "/app.css" })
    ] }),
    /* @__PURE__ */ jsxs("body", { children: [
      /* @__PURE__ */ jsxs("div", { class: "shell", children: [
        /* @__PURE__ */ jsxs("aside", { class: "sidebar", id: "app-nav", children: [
          /* @__PURE__ */ jsxs("div", { class: "brand", children: [
            /* @__PURE__ */ jsx("img", { class: "brand-mark", src: "/logo.svg", alt: "", width: "22", height: "22" }),
            /* @__PURE__ */ jsx("span", { class: "brand-name", children: "Router" })
          ] }),
          /* @__PURE__ */ jsx("span", { class: "brand-scope", children: "personal free-tier gateway" }),
          /* @__PURE__ */ jsxs("div", { class: "nav-group", children: [
            /* @__PURE__ */ jsx("span", { class: "nav-label", children: "Console" }),
            /* @__PURE__ */ jsx("nav", { class: "nav", "aria-label": "Sections", children: NAV.map((item) => /* @__PURE__ */ jsxs(
              "a",
              {
                href: item.href,
                "aria-current": props.active === item.id ? "page" : void 0,
                children: [
                  /* @__PURE__ */ jsx(Icon, { id: item.id }),
                  item.label,
                  item.id === "providers" && props.alerts ? /* @__PURE__ */ jsx("span", { class: "nav-count", children: props.alerts }) : null
                ]
              }
            )) })
          ] }),
          /* @__PURE__ */ jsxs("div", { class: "sidebar-foot", children: [
            /* @__PURE__ */ jsx("span", { class: "who", children: "KIRA \xB7 own keys" }),
            /* @__PURE__ */ jsx("a", { class: "btn btn-quiet btn-sm", href: "/logout", children: "Sign out" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { class: "main", children: [
          /* @__PURE__ */ jsxs("header", { class: "phone-bar", children: [
            /* @__PURE__ */ jsx("button", { class: "pb-menu", type: "button", "aria-label": "Open navigation", "aria-expanded": "false", "data-menu": true, children: /* @__PURE__ */ jsx("svg", { viewBox: "0 0 24 24", width: "18", height: "18", "aria-hidden": "true", children: raw('<path d="M4 7h16M4 12h16M4 17h16"/>') }) }),
            /* @__PURE__ */ jsx("span", { class: "pb-title", children: props.shortTitle })
          ] }),
          /* @__PURE__ */ jsx("main", { class: "canvas", children: props.children })
        ] })
      ] }),
      /* @__PURE__ */ jsx("script", { src: "/charts.js", defer: true }),
      /* @__PURE__ */ jsx("script", { src: "/app.js", defer: true })
    ] })
  ] })
] });

// src/ui/pages/overview.tsx
import { raw as raw2 } from "hono/html";

// src/ui/components.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "hono/jsx/jsx-runtime";
var Section = (props) => /* @__PURE__ */ jsxs2("section", { children: [
  /* @__PURE__ */ jsxs2("div", { class: "section-head", children: [
    /* @__PURE__ */ jsxs2("h2", { children: [
      props.title,
      props.aside ? /* @__PURE__ */ jsx2("span", { class: "aside", children: props.aside }) : null
    ] }),
    props.action ? /* @__PURE__ */ jsx2("a", { class: "action", href: props.action.href, children: props.action.label }) : null
  ] }),
  props.children
] });
var Mark = (props) => /* @__PURE__ */ jsx2("span", { class: `mark ${props.tone}`, children: props.children });
function statusOf(p) {
  if (p.status === "degraded") return { tone: "bad", label: "Degraded" };
  if (p.status === "warn") return { tone: "warn", label: "Near cap" };
  if (p.status === "off") return { tone: "neutral", label: "Idle" };
  return { tone: "ok", label: "Serving" };
}
var Chart = ({ config: config2 }) => /* @__PURE__ */ jsx2("div", { class: "chart", "data-chart": JSON.stringify(config2) });
function contextLabel(k) {
  if (k >= 1e3) return `${(k / 1e3).toFixed(k % 1e3 === 0 ? 0 : 1)}M`;
  return `${k}K`;
}
var SHORT = {
  openrouter: "openrouter",
  nvidia: "nvidia",
  huggingface: "hf",
  chutes: "chutes",
  sambanova: "sambanova",
  pollinations: "pollinations",
  groq: "groq",
  cerebras: "cerebras",
  gemini: "gemini",
  cloudflare: "cloudflare",
  zhipu: "zhipu",
  deepinfra: "deepinfra",
  novita: "novita",
  mistral: "mistral",
  modelscope: "modelscope"
};
function relTime(minutesAgo) {
  if (minutesAgo === 0) return "just now";
  if (minutesAgo === 1) return "1 min ago";
  return `${minutesAgo} min ago`;
}

// src/ui/pages/overview.tsx
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs3 } from "hono/jsx/jsx-runtime";
var COPY_ICON = '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6a3 3 0 0 0-3 3v6.5A2.5 2.5 0 0 0 5.5 15"/>';
var LANE_LABEL = {
  nvidia: "nvidia",
  sambanova: "samba",
  cerebras: "cerebras",
  groq: "groq",
  cloudflare: "cf",
  openrouter: "or",
  huggingface: "hf",
  pollinations: "poll"
};
var Overview = ({ data, metric }) => {
  const isTokens = metric === "tokens";
  const values = isTokens ? data.hourlyTokens : data.hourly;
  const total = isTokens ? data.tokensToday : data.requestsToday;
  const peak = Math.max(...values);
  const usedShare = data.capacityToday > 0 ? data.requestsToday / data.capacityToday : 0;
  return /* @__PURE__ */ jsxs3("div", { class: "stack", children: [
    /* @__PURE__ */ jsxs3("div", { class: "page-head", children: [
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx3("h1", { children: "Free-tier router" }),
        /* @__PURE__ */ jsxs3("p", { class: "sub", children: [
          "One OpenAI-compatible endpoint in front of ",
          data.providersLive,
          " free providers.",
          " ",
          thousands(data.requestsToday),
          " requests served today out of",
          " ",
          thousands(data.capacityToday),
          " available."
        ] })
      ] }),
      /* @__PURE__ */ jsx3("div", { class: "head-actions", children: /* @__PURE__ */ jsxs3("span", { class: data.live ? "stamp" : "stamp demo", children: [
        utcStamp(),
        data.live ? "" : " \xB7 demo data"
      ] }) })
    ] }),
    /* @__PURE__ */ jsx3(Section, { title: "Auto chain", aside: 'what model: "auto" tries, in order', action: { href: "/providers", label: "Edit order" }, children: /* @__PURE__ */ jsxs3("div", { class: "card", children: [
      /* @__PURE__ */ jsx3("div", { class: "lane", role: "list", "aria-label": "Fallback chain, segments sized by remaining quota today", children: data.chain.map((node) => {
        const share = data.chainTotal > 0 ? node.left / data.chainTotal : 0;
        const wide = share >= 0.05;
        return /* @__PURE__ */ jsx3(
          "div",
          {
            class: `lane-seg ${node.state}${wide ? " wide" : ""}`,
            role: "listitem",
            "data-name": LANE_LABEL[node.provider] ?? node.provider,
            style: `--grow: ${Math.max(node.left, 1)}; --share: ${share.toFixed(4)}`,
            title: `${providerName(node.provider)} \xB7 ${node.family} \xB7 ${thousands(node.left)} left today`,
            children: wide ? /* @__PURE__ */ jsxs3(Fragment2, { children: [
              /* @__PURE__ */ jsx3("span", { class: "seg-name", children: LANE_LABEL[node.provider] ?? node.provider }),
              /* @__PURE__ */ jsx3("span", { class: "seg-left", children: thousands(node.left) })
            ] }) : null
          }
        );
      }) }),
      /* @__PURE__ */ jsxs3("div", { class: "lane-meta", children: [
        /* @__PURE__ */ jsxs3("span", { class: "lead", children: [
          thousands(data.chainTotal),
          " requests left across ",
          data.chain.length,
          " hops"
        ] }),
        /* @__PURE__ */ jsx3("span", { children: data.chain.length > 0 ? /* @__PURE__ */ jsxs3(Fragment2, { children: [
          "next up: ",
          data.chain[0].provider,
          "/",
          data.chain[0].family,
          " \xB7 ",
          thousands(data.chain[0].left),
          " left"
        ] }) : "no chain configured" })
      ] }),
      /* @__PURE__ */ jsx3("p", { class: "lane-order", children: data.chain.map((node, i) => /* @__PURE__ */ jsxs3(Fragment2, { children: [
        i > 0 ? /* @__PURE__ */ jsx3("span", { class: "arrow", children: " \u2192 " }) : null,
        /* @__PURE__ */ jsx3("span", { class: node.state === "exhausted" ? "out" : void 0, children: node.provider })
      ] })) }),
      /* @__PURE__ */ jsxs3("div", { class: "lane-legend", children: [
        /* @__PURE__ */ jsxs3("span", { children: [
          /* @__PURE__ */ jsx3("i", { class: "swatch s-live" }),
          " has headroom"
        ] }),
        /* @__PURE__ */ jsxs3("span", { children: [
          /* @__PURE__ */ jsx3("i", { class: "swatch s-cooling" }),
          " under 20 left"
        ] }),
        /* @__PURE__ */ jsxs3("span", { children: [
          /* @__PURE__ */ jsx3("i", { class: "swatch s-exhausted" }),
          " exhausted today"
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx3(Section, { title: "Today", aside: "counters reset at 00:00 UTC", action: { href: "/usage", label: "Full breakdown" }, children: /* @__PURE__ */ jsxs3("div", { class: "tray", children: [
      /* @__PURE__ */ jsxs3("div", { class: "kpi-strip", children: [
        /* @__PURE__ */ jsxs3("a", { class: "kpi", href: "/?m=requests", "aria-current": !isTokens ? "true" : void 0, children: [
          /* @__PURE__ */ jsx3("span", { class: "kpi-label", children: "Requests served" }),
          /* @__PURE__ */ jsx3("span", { class: "kpi-value", children: thousands(data.requestsToday) }),
          /* @__PURE__ */ jsxs3("span", { class: "kpi-note", children: [
            "of ",
            thousands(data.capacityToday),
            " available"
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("a", { class: "kpi", href: "/?m=tokens", "aria-current": isTokens ? "true" : void 0, children: [
          /* @__PURE__ */ jsx3("span", { class: "kpi-label", children: "Tokens" }),
          /* @__PURE__ */ jsx3("span", { class: "kpi-value", children: compact(data.tokensToday) }),
          /* @__PURE__ */ jsxs3("span", { class: "kpi-note", children: [
            "across ",
            data.providersLive,
            " providers"
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { class: "kpi", children: [
          /* @__PURE__ */ jsx3("span", { class: "kpi-label", children: "Capacity used" }),
          /* @__PURE__ */ jsxs3("span", { class: "kpi-value", children: [
            (usedShare * 100).toFixed(1),
            /* @__PURE__ */ jsx3("span", { class: "unit", children: "%" })
          ] }),
          /* @__PURE__ */ jsx3("span", { class: "kpi-note", children: "of the daily free allowance" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { class: "kpi", children: [
          /* @__PURE__ */ jsx3("span", { class: "kpi-label", children: "Chain remaining" }),
          /* @__PURE__ */ jsx3("span", { class: "kpi-value", children: thousands(data.chainTotal) }),
          /* @__PURE__ */ jsxs3("span", { class: "kpi-note", children: [
            data.chainLive,
            " of ",
            data.chain.length,
            " hops live"
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { class: "kpi", children: [
          /* @__PURE__ */ jsx3("span", { class: "kpi-label", children: "p95 latency" }),
          /* @__PURE__ */ jsxs3("span", { class: "kpi-value", children: [
            thousands(data.weightedP95),
            /* @__PURE__ */ jsx3("span", { class: "unit", children: "ms" })
          ] }),
          /* @__PURE__ */ jsx3("span", { class: "kpi-note", children: "weighted by requests" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { class: "tray-row", children: [
        /* @__PURE__ */ jsxs3("div", { class: "card", children: [
          /* @__PURE__ */ jsxs3("div", { class: "chart-note", children: [
            /* @__PURE__ */ jsx3("span", { class: "what", children: isTokens ? "Tokens by hour" : "Requests by hour" }),
            /* @__PURE__ */ jsxs3("span", { class: "total", children: [
              isTokens ? compact(total) : thousands(total),
              " \xB7 UTC today"
            ] })
          ] }),
          /* @__PURE__ */ jsx3(
            Chart,
            {
              config: {
                kind: "bars",
                labels: data.hourLabels,
                values,
                highlight: data.currentHour,
                format: isTokens ? "compact" : "int",
                height: 224,
                colour: "var(--chart-3)"
              }
            }
          ),
          /* @__PURE__ */ jsxs3("div", { class: "chart-foot", children: [
            /* @__PURE__ */ jsxs3("span", { children: [
              "The blue bar is the hour in progress. Nothing after ",
              data.hourLabels[data.currentHour],
              " has happened yet."
            ] }),
            /* @__PURE__ */ jsxs3("span", { children: [
              "peak ",
              isTokens ? compact(peak) : thousands(peak),
              "/h"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { class: "card", children: [
          /* @__PURE__ */ jsxs3("div", { class: "chart-note", children: [
            /* @__PURE__ */ jsx3("span", { class: "what", children: "Closest to the cap" }),
            /* @__PURE__ */ jsxs3("span", { class: "total", children: [
              data.nearCap.length,
              " of ",
              data.providersLive
            ] })
          ] }),
          /* @__PURE__ */ jsx3("div", { class: "rank", children: data.nearCap.map((p) => {
            const pct = burn(p);
            const tone = pct >= 0.95 ? " is-hot" : pct > 0.8 ? " is-warm" : "";
            return /* @__PURE__ */ jsxs3("div", { class: "rank-row", children: [
              /* @__PURE__ */ jsxs3("div", { class: "rank-name", children: [
                /* @__PURE__ */ jsx3("span", { class: "n", children: p.name }),
                /* @__PURE__ */ jsx3("div", { class: `rank-bar${tone}`, role: "img", "aria-label": `${(pct * 100).toFixed(0)} percent of the daily ceiling used`, children: /* @__PURE__ */ jsx3("i", { style: `width: ${(pct * 100).toFixed(1)}%` }) })
              ] }),
              /* @__PURE__ */ jsxs3("div", { class: "rank-val", children: [
                /* @__PURE__ */ jsx3("span", { class: "v", children: thousands(p.used) }),
                /* @__PURE__ */ jsxs3("span", { class: "u", children: [
                  "of ",
                  thousands(p.limit)
                ] })
              ] })
            ] });
          }) })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx3(Section, { title: "Recent requests", aside: data.live ? "last requests this UTC day" : "last 12 minutes", action: { href: "/usage", label: "See all" }, children: /* @__PURE__ */ jsx3("div", { class: "card", children: /* @__PURE__ */ jsxs3("table", { class: "table", children: [
      /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs3("tr", { children: [
        /* @__PURE__ */ jsx3("th", { children: "Request" }),
        /* @__PURE__ */ jsx3("th", { children: "Model" }),
        /* @__PURE__ */ jsx3("th", { children: "Provider" }),
        /* @__PURE__ */ jsx3("th", { class: "r", children: "Status" }),
        /* @__PURE__ */ jsx3("th", { class: "r", children: "Latency" }),
        /* @__PURE__ */ jsx3("th", { class: "r", children: "Tokens" }),
        /* @__PURE__ */ jsx3("th", { class: "r", children: "Fallbacks" })
      ] }) }),
      /* @__PURE__ */ jsx3("tbody", { children: data.requests.length === 0 ? /* @__PURE__ */ jsx3("tr", { children: /* @__PURE__ */ jsxs3("td", { colspan: 7, class: "empty", children: [
        "No requests today yet",
        data.live ? "" : " (sample data)",
        "."
      ] }) }) : data.requests.map((r) => /* @__PURE__ */ jsxs3("tr", { children: [
        /* @__PURE__ */ jsxs3("td", { class: "id", children: [
          /* @__PURE__ */ jsxs3("span", { children: [
            r.id.slice(0, 8),
            "\u2026"
          ] }),
          /* @__PURE__ */ jsx3("button", { class: "copy", type: "button", "data-copy": r.id, "aria-label": `Copy request id ${r.id}`, title: "Copy full id", children: /* @__PURE__ */ jsx3("svg", { viewBox: "0 0 24 24", width: "13", height: "13", "aria-hidden": "true", children: raw2(COPY_ICON) }) }),
          /* @__PURE__ */ jsx3("span", { class: "dim ago", children: relTime(r.minutesAgo) })
        ] }),
        /* @__PURE__ */ jsx3("td", { class: "model", children: r.family }),
        /* @__PURE__ */ jsx3("td", { class: "dim", children: providerName(r.provider) }),
        /* @__PURE__ */ jsx3("td", { class: "r", children: r.status === 200 ? /* @__PURE__ */ jsx3("span", { class: "num", children: r.status }) : /* @__PURE__ */ jsx3(Mark, { tone: "bad", children: r.status }) }),
        /* @__PURE__ */ jsxs3("td", { class: "r num", children: [
          thousands(r.ms),
          " ms"
        ] }),
        /* @__PURE__ */ jsx3("td", { class: "r num", children: thousands(r.tokens) }),
        /* @__PURE__ */ jsx3("td", { class: "r num", children: r.fallbacks === 0 ? /* @__PURE__ */ jsx3("span", { class: "zero", children: "0" }) : r.fallbacks })
      ] })) })
    ] }) }) }),
    /* @__PURE__ */ jsx3("p", { class: "footnote", children: data.live ? "Live from Neon. Keys are sealed with AES-256-GCM before they are written; the router walks the chain until one provider answers with headers, which is the last moment a fallback is still possible." : "Demo dataset \u2014 set DATABASE_URL to render live traffic." })
  ] });
};

// src/ui/pages/models.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "hono/jsx/jsx-runtime";
var TABS = [
  { id: "all", label: "All families" },
  { id: "tools", label: "Tool calling" },
  { id: "vision", label: "Vision" },
  { id: "long", label: "200K+ context" }
];
function keep(row, filter) {
  if (filter === "tools") return row.tools;
  if (filter === "vision") return row.vision;
  if (filter === "long") return row.contextK >= 200;
  return true;
}
var byServed = (a, b) => b.served - a.served;
var Models = ({ data, filter }) => {
  const rows = data.models.filter((r) => keep(r, filter)).sort(byServed);
  const served = rows.reduce((a, r) => a + r.served, 0);
  const endpoints = rows.reduce((a, r) => a + r.providers.length, 0);
  return /* @__PURE__ */ jsxs4("div", { class: "stack", children: [
    /* @__PURE__ */ jsxs4("div", { class: "page-head", children: [
      /* @__PURE__ */ jsxs4("div", { children: [
        /* @__PURE__ */ jsx4("h1", { children: "Models" }),
        /* @__PURE__ */ jsxs4("p", { class: "sub", children: [
          data.modelFamilies,
          " families across ",
          data.modelEndpoints,
          " free endpoints. Ask for a bare family name and the router fans out across every provider that serves it, most headroom first."
        ] })
      ] }),
      /* @__PURE__ */ jsx4("div", { class: "head-actions", children: /* @__PURE__ */ jsxs4("span", { class: "stamp", children: [
        "longest context ",
        data.modelLongest.toLocaleString("en-US"),
        "K"
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs4("div", { children: [
      /* @__PURE__ */ jsxs4("div", { class: "tabs", children: [
        TABS.map((tab) => /* @__PURE__ */ jsx4("a", { href: tab.id === "all" ? "/models" : `/models?f=${tab.id}`, "aria-current": filter === tab.id ? "page" : void 0, children: tab.label })),
        /* @__PURE__ */ jsxs4("span", { class: "count", "data-count-wrap": true, children: [
          /* @__PURE__ */ jsx4("strong", { "data-count": true, children: rows.length }),
          " of ",
          data.modelFamilies,
          " families"
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { class: "toolbar", children: [
        /* @__PURE__ */ jsx4(
          "input",
          {
            class: "search",
            type: "search",
            placeholder: "Filter by family or provider",
            "aria-label": "Filter families by name or provider",
            "data-filter": true
          }
        ),
        /* @__PURE__ */ jsx4("span", { class: "spacer" }),
        /* @__PURE__ */ jsxs4("span", { class: "count", children: [
          thousands(served),
          " requests today \xB7 ",
          endpoints,
          " endpoints"
        ] })
      ] }),
      /* @__PURE__ */ jsx4("div", { class: "card", children: /* @__PURE__ */ jsxs4("table", { class: "table", children: [
        /* @__PURE__ */ jsx4("thead", { children: /* @__PURE__ */ jsxs4("tr", { children: [
          /* @__PURE__ */ jsx4("th", { children: "Family" }),
          /* @__PURE__ */ jsx4("th", { children: "Served by" }),
          /* @__PURE__ */ jsx4("th", { class: "r", children: "Context" }),
          /* @__PURE__ */ jsx4("th", { class: "r", children: "Tools" }),
          /* @__PURE__ */ jsx4("th", { class: "r", children: "Vision" }),
          /* @__PURE__ */ jsx4("th", { class: "r", children: "Served today" })
        ] }) }),
        /* @__PURE__ */ jsxs4("tbody", { children: [
          rows.map((row) => {
            const names = row.providers.slice(0, 3).map(providerName);
            const more = row.providers.length - names.length;
            return /* @__PURE__ */ jsxs4("tr", { "data-search": `${row.family} ${row.providers.join(" ")}`.toLowerCase(), children: [
              /* @__PURE__ */ jsx4("td", { class: "model", children: row.family }),
              /* @__PURE__ */ jsxs4("td", { class: "dim served-by", children: [
                names.join(", "),
                more > 0 ? ` +${more}` : ""
              ] }),
              /* @__PURE__ */ jsx4("td", { class: "r num", children: contextLabel(row.contextK) }),
              /* @__PURE__ */ jsx4("td", { class: "r", children: row.tools ? "Yes" : /* @__PURE__ */ jsx4("span", { class: "zero", children: "\u2013" }) }),
              /* @__PURE__ */ jsx4("td", { class: "r", children: row.vision ? "Yes" : /* @__PURE__ */ jsx4("span", { class: "zero", children: "\u2013" }) }),
              /* @__PURE__ */ jsx4("td", { class: "r num", children: thousands(row.served) })
            ] });
          }),
          /* @__PURE__ */ jsx4("tr", { class: "no-match", hidden: true, children: /* @__PURE__ */ jsx4("td", { colspan: 6, class: "empty", children: "No family matches that." }) })
        ] })
      ] }) }),
      /* @__PURE__ */ jsxs4("p", { class: "footnote", children: [
        thousands(data.requestsToday - served),
        " of today's ",
        thousands(data.requestsToday),
        " requests went to families below this list."
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("section", { children: [
      /* @__PURE__ */ jsx4("div", { class: "section-head", children: /* @__PURE__ */ jsxs4("h2", { children: [
        "Ask for one",
        /* @__PURE__ */ jsx4("span", { class: "aside", children: "only variable" })
      ] }) }),
      /* @__PURE__ */ jsxs4("div", { class: "card", children: [
        /* @__PURE__ */ jsx4("pre", { class: "code", children: /* @__PURE__ */ jsx4("code", { children: `curl "$ROUTER_URL/v1/chat/completions" \\
   -H "authorization: Bearer $ROUTER_KEY" \\
   -H "content-type: application/json" \\
   -d '{"model":"gpt-oss-120b","stream":true,
        "messages":[{"role":"user","content":"hi"}]}'` }) }),
        /* @__PURE__ */ jsxs4("p", { class: "code-note", children: [
          /* @__PURE__ */ jsx4("span", { class: "mono", children: "model" }),
          " is the only variable."
        ] })
      ] })
    ] })
  ] });
};

// src/ui/pages/providers.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "hono/jsx/jsx-runtime";
var Providers = (props) => {
  const usage = props.data.usage;
  const nearCap = usage.filter((p) => burn(p) > 0.8);
  const keyed = usage.filter((p) => p.keys > 0).length;
  return /* @__PURE__ */ jsxs5("div", { class: "stack settings", children: [
    /* @__PURE__ */ jsxs5("div", { class: "page-head", children: [
      /* @__PURE__ */ jsxs5("div", { children: [
        /* @__PURE__ */ jsx5("h1", { children: "Providers" }),
        /* @__PURE__ */ jsxs5("p", { class: "sub", children: [
          keyed,
          " keyed providers and one keyless endpoint. Keys are sealed with AES-256-GCM before they reach Postgres; the router holds one decrypted key for the length of a request."
        ] })
      ] }),
      /* @__PURE__ */ jsx5("div", { class: "head-actions", children: /* @__PURE__ */ jsxs5("span", { class: "stamp", children: [
        usage.length,
        " of ",
        props.data.off.length,
        " configured"
      ] }) })
    ] }),
    props.notice ? /* @__PURE__ */ jsx5("div", { class: "notice", role: "status", children: props.notice }) : null,
    /* @__PURE__ */ jsxs5("div", { class: "section-row", children: [
      /* @__PURE__ */ jsxs5("div", { class: "setting-col", children: [
        /* @__PURE__ */ jsx5("h2", { children: "Provider keys" }),
        /* @__PURE__ */ jsx5("p", { children: "One row per provider. Replace rotates the key without dropping the provider out of the chain; the old key stops being selected immediately." }),
        /* @__PURE__ */ jsxs5("p", { class: "summary", children: [
          nearCap.length,
          " providers are past 80% of their ceiling:",
          " ",
          nearCap.map((p) => p.name).join(", "),
          "."
        ] })
      ] }),
      /* @__PURE__ */ jsxs5("div", { children: [
        /* @__PURE__ */ jsx5("div", { class: "panel", children: usage.map((p) => {
          const s = statusOf(p);
          return /* @__PURE__ */ jsxs5("div", { class: "key-row", children: [
            /* @__PURE__ */ jsxs5("div", { class: "kl", children: [
              /* @__PURE__ */ jsxs5("span", { class: "lbl", children: [
                p.name,
                p.keys > 1 ? /* @__PURE__ */ jsxs5("span", { class: "keys", children: [
                  " ",
                  p.keys,
                  " keys"
                ] }) : null
              ] }),
              /* @__PURE__ */ jsxs5("span", { class: "hint", children: [
                p.keyHint ? `sk-\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${p.keyHint}` : "no key needed",
                " \xB7 ",
                p.keyAge
              ] })
            ] }),
            /* @__PURE__ */ jsx5(Mark, { tone: s.tone, children: s.label }),
            /* @__PURE__ */ jsx5("div", { class: "acts", children: /* @__PURE__ */ jsx5("button", { class: "btn btn-sm btn-quiet", type: "button", "data-prefill": p.id, children: p.keyHint ? "Replace" : "Add key" }) })
          ] });
        }) }),
        props.data.off.length > 0 ? /* @__PURE__ */ jsxs5("p", { class: "off-list", children: [
          "Not configured: ",
          props.data.off.map((p) => `${p.name} (${p.reason})`).join(" \xB7 ")
        ] }) : null,
        /* @__PURE__ */ jsxs5("form", { class: "panel add-key", method: "post", action: "/providers/keys", children: [
          /* @__PURE__ */ jsxs5("div", { class: "field", children: [
            /* @__PURE__ */ jsx5("label", { for: "pk-provider", children: "Provider" }),
            /* @__PURE__ */ jsxs5("select", { id: "pk-provider", name: "provider", "data-provider-select": true, required: true, children: [
              usage.map((p) => /* @__PURE__ */ jsx5("option", { value: p.id, children: p.name })),
              props.data.off.map((p) => /* @__PURE__ */ jsx5("option", { value: p.id, children: p.name }))
            ] })
          ] }),
          /* @__PURE__ */ jsxs5("div", { class: "field", children: [
            /* @__PURE__ */ jsx5("label", { for: "pk-key", children: "API key" }),
            /* @__PURE__ */ jsx5(
              "input",
              {
                id: "pk-key",
                name: "key",
                type: "password",
                autocomplete: "off",
                spellcheck: false,
                required: true,
                "aria-describedby": "pk-help"
              }
            ),
            /* @__PURE__ */ jsx5("span", { class: "help", id: "pk-help", children: "Sealed in the same request that stores it. Only the last four characters are kept in the clear." })
          ] }),
          /* @__PURE__ */ jsxs5("div", { class: "field", children: [
            /* @__PURE__ */ jsx5("label", { for: "pk-label", children: "Label" }),
            /* @__PURE__ */ jsx5("input", { id: "pk-label", name: "label", type: "text", value: "primary" })
          ] }),
          /* @__PURE__ */ jsx5("button", { class: "btn btn-primary", type: "submit", children: "Add key" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs5("div", { class: "section-row", children: [
      /* @__PURE__ */ jsxs5("div", { class: "setting-col", children: [
        /* @__PURE__ */ jsx5("h2", { children: "Daily limits" }),
        /* @__PURE__ */ jsx5("p", { children: "The ceiling the router will not cross for each provider, in requests per UTC day. Zero means no cap: the provider is tried last, never filtered out." }),
        /* @__PURE__ */ jsxs5("p", { class: "summary", children: [
          thousands(usage.reduce((a, p) => a + p.limit, 0)),
          " requests a day in total, of which",
          " ",
          thousands(usage.reduce((a, p) => a + p.used, 0)),
          " are spent."
        ] })
      ] }),
      /* @__PURE__ */ jsx5("div", { class: "panel", children: /* @__PURE__ */ jsxs5("form", { method: "post", action: "/providers/limits", children: [
        usage.map((p) => /* @__PURE__ */ jsxs5("div", { class: "switch-row", children: [
          /* @__PURE__ */ jsxs5("div", { class: "sr-main", children: [
            /* @__PURE__ */ jsx5("div", { class: "sr-title", children: p.name }),
            /* @__PURE__ */ jsxs5("div", { class: "sr-desc", children: [
              thousands(p.used),
              " used today \xB7 p95 ",
              thousands(p.p95),
              " ms",
              p.rateLimited > 0 ? ` \xB7 ${p.rateLimited} rate-limited` : ""
            ] })
          ] }),
          /* @__PURE__ */ jsx5(
            "input",
            {
              class: "limit-input",
              type: "number",
              name: `limit_${p.id}`,
              value: String(p.limit),
              min: "0",
              step: "50",
              "aria-label": `${p.name} daily request limit`
            }
          )
        ] })),
        /* @__PURE__ */ jsx5("button", { class: "btn btn-primary save", type: "submit", children: "Save limits" })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs5("div", { class: "section-row", children: [
      /* @__PURE__ */ jsxs5("div", { class: "setting-col", children: [
        /* @__PURE__ */ jsx5("h2", { children: "Catalog sync" }),
        /* @__PURE__ */ jsx5("p", { children: "Pulls each provider's model list and marks anything that disappeared as disabled. Run it after adding a key, and whenever a family starts returning 404." })
      ] }),
      /* @__PURE__ */ jsxs5("div", { class: "panel", children: [
        /* @__PURE__ */ jsxs5("div", { class: "switch-row", children: [
          /* @__PURE__ */ jsxs5("div", { class: "sr-main", children: [
            /* @__PURE__ */ jsx5("div", { class: "sr-title", children: "Last sync" }),
            /* @__PURE__ */ jsx5("div", { class: "sr-desc", children: "Synced on demand from the Sync button below" })
          ] }),
          /* @__PURE__ */ jsx5("form", { method: "post", action: "/providers/sync", children: /* @__PURE__ */ jsx5("button", { class: "btn", type: "submit", children: "Sync now" }) })
        ] }),
        /* @__PURE__ */ jsx5("p", { class: "help", children: "A sync is one request per provider. Providers whose key is missing are skipped, not retried." })
      ] })
    ] })
  ] });
};

// src/ui/pages/usage.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "hono/jsx/jsx-runtime";
var METRICS = [
  { id: "requests", label: "Requests" },
  { id: "tokens", label: "Tokens" },
  { id: "burn", label: "Share of cap" }
];
var Usage = ({ data, metric }) => {
  const ranked = [...data.usage].sort((a, b) => b.used - a.used);
  const top = ranked.slice(0, 8);
  const config2 = metric === "burn" ? {
    kind: "bars",
    labels: ranked.map((p) => SHORT[p.id] ?? p.id),
    values: ranked.map((p) => Number(burn(p).toFixed(3))),
    format: "pct0",
    tickFormat: "pct0",
    height: 268,
    highlight: ranked.map((p, i) => burn(p) >= 0.8 ? i : -1).filter((i) => i >= 0),
    colour: "var(--chart-3)"
  } : {
    kind: "bars",
    labels: data.hourLabels,
    values: metric === "tokens" ? data.hourlyTokens : data.hourly,
    highlight: data.currentHour,
    format: metric === "tokens" ? "compact" : "int",
    height: 268,
    colour: "var(--chart-3)"
  };
  const what = metric === "burn" ? "Daily ceiling used, per provider" : metric === "tokens" ? "Tokens by hour" : "Requests by hour";
  const totalLabel = metric === "burn" ? `${ranked.filter((p) => burn(p) > 0.8).length} above 80%` : metric === "tokens" ? `${compact(data.tokensToday)} / UTC today` : `${thousands(data.requestsToday)} / UTC today`;
  return /* @__PURE__ */ jsxs6("div", { class: "stack", children: [
    /* @__PURE__ */ jsxs6("div", { class: "page-head ruled", children: [
      /* @__PURE__ */ jsxs6("div", { children: [
        /* @__PURE__ */ jsx6("h1", { children: "Usage" }),
        /* @__PURE__ */ jsxs6("p", { class: "sub", children: [
          data.requestsToday,
          " requests and ",
          compact(data.tokensToday),
          " tokens spent against",
          " ",
          thousands(data.capacityToday),
          " available requests today."
        ] })
      ] }),
      /* @__PURE__ */ jsx6("div", { class: "head-actions", children: /* @__PURE__ */ jsxs6("span", { class: "stamp", children: [
        "p95 ",
        thousands(data.weightedP95),
        " ms"
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs6("div", { class: "two-up-rev", children: [
      /* @__PURE__ */ jsxs6("div", { class: "card", children: [
        /* @__PURE__ */ jsxs6("div", { class: "chart-note", children: [
          /* @__PURE__ */ jsx6("span", { class: "what", children: "Where the requests went" }),
          /* @__PURE__ */ jsxs6("span", { class: "total", children: [
            "top 8 of ",
            ranked.length
          ] })
        ] }),
        /* @__PURE__ */ jsx6("div", { class: "ledger", children: top.map((p) => /* @__PURE__ */ jsxs6("div", { class: "ledger-row", children: [
          /* @__PURE__ */ jsx6("span", { class: "name", children: p.name }),
          /* @__PURE__ */ jsxs6("span", { class: "share", children: [
            (burn(p) * 100).toFixed(0),
            "% of cap"
          ] }),
          /* @__PURE__ */ jsx6("span", { class: "v num", children: thousands(p.used) })
        ] })) }),
        /* @__PURE__ */ jsxs6("p", { class: "footnote tight", children: [
          "The remaining ",
          ranked.length - top.length,
          " providers took ",
          thousands(data.requestsToday - top.reduce((a, p) => a + p.used, 0)),
          " requests between them."
        ] })
      ] }),
      /* @__PURE__ */ jsxs6("div", { class: "card", children: [
        /* @__PURE__ */ jsxs6("div", { class: "chart-note", children: [
          /* @__PURE__ */ jsx6("span", { class: "what", children: what }),
          /* @__PURE__ */ jsx6("span", { class: "total", children: totalLabel })
        ] }),
        /* @__PURE__ */ jsx6(Chart, { config: config2 }),
        /* @__PURE__ */ jsx6("div", { class: "range", children: METRICS.map((m) => /* @__PURE__ */ jsx6(
          "a",
          {
            href: m.id === "requests" ? "/usage" : `/usage?m=${m.id}`,
            "aria-current": metric === m.id ? "true" : void 0,
            children: m.label
          }
        )) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs6("section", { children: [
      /* @__PURE__ */ jsxs6("div", { class: "section-head", children: [
        /* @__PURE__ */ jsx6("h2", { class: "quiet", children: "By provider" }),
        /* @__PURE__ */ jsxs6("span", { class: "count", children: [
          data.rateLimitedToday,
          " rate-limited calls today"
        ] })
      ] }),
      /* @__PURE__ */ jsx6("div", { class: "card", children: /* @__PURE__ */ jsxs6("table", { class: "table", children: [
        /* @__PURE__ */ jsx6("thead", { children: /* @__PURE__ */ jsxs6("tr", { children: [
          /* @__PURE__ */ jsx6("th", { children: "Provider" }),
          /* @__PURE__ */ jsx6("th", { class: "r", children: "Keys" }),
          /* @__PURE__ */ jsx6("th", { class: "r", children: "Requests" }),
          /* @__PURE__ */ jsx6("th", { class: "r", children: "Tokens" }),
          /* @__PURE__ */ jsx6("th", { class: "r", children: "Of cap" }),
          /* @__PURE__ */ jsx6("th", { class: "r", children: "Rate-limited" }),
          /* @__PURE__ */ jsx6("th", { class: "r", children: "p95" })
        ] }) }),
        /* @__PURE__ */ jsxs6("tbody", { children: [
          ranked.map((p) => /* @__PURE__ */ jsxs6("tr", { children: [
            /* @__PURE__ */ jsx6("td", { class: "model", children: p.name }),
            /* @__PURE__ */ jsx6("td", { class: "r num", children: p.keys === 0 ? /* @__PURE__ */ jsx6("span", { class: "zero", children: "keyless" }) : p.keys }),
            /* @__PURE__ */ jsx6("td", { class: "r num", children: thousands(p.used) }),
            /* @__PURE__ */ jsx6("td", { class: "r num", children: compact(p.tokens) }),
            /* @__PURE__ */ jsxs6("td", { class: "r num", children: [
              (burn(p) * 100).toFixed(1),
              "%"
            ] }),
            /* @__PURE__ */ jsx6("td", { class: "r num", children: p.rateLimited === 0 ? /* @__PURE__ */ jsx6("span", { class: "zero", children: "0" }) : p.rateLimited }),
            /* @__PURE__ */ jsxs6("td", { class: "r num", children: [
              thousands(p.p95),
              " ms"
            ] })
          ] })),
          /* @__PURE__ */ jsxs6("tr", { class: "total-row", children: [
            /* @__PURE__ */ jsx6("td", { children: "All providers" }),
            /* @__PURE__ */ jsx6("td", { class: "r num", children: ranked.reduce((a, p) => a + p.keys, 0) }),
            /* @__PURE__ */ jsx6("td", { class: "r num", children: thousands(data.requestsToday) }),
            /* @__PURE__ */ jsx6("td", { class: "r num", children: compact(data.tokensToday) }),
            /* @__PURE__ */ jsxs6("td", { class: "r num", children: [
              (data.requestsToday / data.capacityToday * 100).toFixed(1),
              "%"
            ] }),
            /* @__PURE__ */ jsx6("td", { class: "r num", children: data.rateLimitedToday }),
            /* @__PURE__ */ jsxs6("td", { class: "r num", children: [
              thousands(data.weightedP95),
              " ms"
            ] })
          ] })
        ] })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs6("section", { children: [
      /* @__PURE__ */ jsx6("div", { class: "section-head", children: /* @__PURE__ */ jsx6("h2", { class: "quiet", children: "Last requests" }) }),
      /* @__PURE__ */ jsx6("div", { class: "card", children: /* @__PURE__ */ jsxs6("table", { class: "table", children: [
        /* @__PURE__ */ jsx6("thead", { children: /* @__PURE__ */ jsxs6("tr", { children: [
          /* @__PURE__ */ jsx6("th", { children: "When" }),
          /* @__PURE__ */ jsx6("th", { children: "Model" }),
          /* @__PURE__ */ jsx6("th", { children: "Provider" }),
          /* @__PURE__ */ jsx6("th", { class: "r", children: "Status" }),
          /* @__PURE__ */ jsx6("th", { class: "r", children: "Latency" }),
          /* @__PURE__ */ jsx6("th", { class: "r", children: "Tokens" }),
          /* @__PURE__ */ jsx6("th", { class: "r", children: "Fallbacks" })
        ] }) }),
        /* @__PURE__ */ jsx6("tbody", { children: data.requests.map((r) => /* @__PURE__ */ jsxs6("tr", { children: [
          /* @__PURE__ */ jsx6("td", { class: "dim", children: relTime(r.minutesAgo) }),
          /* @__PURE__ */ jsx6("td", { class: "model", children: r.family }),
          /* @__PURE__ */ jsx6("td", { class: "dim", children: r.provider }),
          /* @__PURE__ */ jsx6("td", { class: "r", children: r.status === 200 ? /* @__PURE__ */ jsx6("span", { class: "num", children: r.status }) : /* @__PURE__ */ jsx6(Mark, { tone: "bad", children: r.status }) }),
          /* @__PURE__ */ jsxs6("td", { class: "r num", children: [
            thousands(r.ms),
            " ms"
          ] }),
          /* @__PURE__ */ jsx6("td", { class: "r num", children: thousands(r.tokens) }),
          /* @__PURE__ */ jsx6("td", { class: "r num", children: r.fallbacks === 0 ? /* @__PURE__ */ jsx6("span", { class: "zero", children: "0" }) : r.fallbacks })
        ] })) })
      ] }) })
    ] })
  ] });
};

// src/ui/pages/login.tsx
import { raw as raw3 } from "hono/html";
import { Fragment as Fragment3, jsx as jsx7, jsxs as jsxs7 } from "hono/jsx/jsx-runtime";
var Login = ({ error }) => /* @__PURE__ */ jsxs7(Fragment3, { children: [
  raw3("<!DOCTYPE html>"),
  /* @__PURE__ */ jsxs7("html", { lang: "en", children: [
    /* @__PURE__ */ jsxs7("head", { children: [
      /* @__PURE__ */ jsx7("meta", { charset: "utf-8" }),
      /* @__PURE__ */ jsx7("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
      /* @__PURE__ */ jsx7("title", { children: "Sign in \xB7 Router" }),
      /* @__PURE__ */ jsx7("link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }),
      /* @__PURE__ */ jsx7("meta", { name: "theme-color", content: "#1d5fbf" }),
      /* @__PURE__ */ jsx7("meta", { name: "color-scheme", content: "light" }),
      /* @__PURE__ */ jsx7("link", { rel: "preconnect", href: "https://fonts.googleapis.com" }),
      /* @__PURE__ */ jsx7("link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "anonymous" }),
      /* @__PURE__ */ jsx7(
        "link",
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&family=Geist+Mono:wght@400;500&display=swap"
        }
      ),
      /* @__PURE__ */ jsx7("link", { rel: "stylesheet", href: "/app.css" })
    ] }),
    /* @__PURE__ */ jsx7("body", { class: "gate", children: /* @__PURE__ */ jsxs7("main", { class: "gate-card", children: [
      /* @__PURE__ */ jsxs7("div", { class: "brand gate-brand", children: [
        /* @__PURE__ */ jsx7("img", { class: "brand-mark", src: "/logo.svg", alt: "", width: "22", height: "22" }),
        /* @__PURE__ */ jsx7("span", { class: "brand-name", children: "Router" })
      ] }),
      /* @__PURE__ */ jsx7("h1", { children: "Sign in" }),
      /* @__PURE__ */ jsxs7("p", { class: "sub", children: [
        "The console is password-gated. It reads the same value as",
        " ",
        /* @__PURE__ */ jsx7("span", { class: "mono", children: "DASHBOARD_PASSWORD" }),
        "."
      ] }),
      /* @__PURE__ */ jsxs7("form", { method: "post", action: "/login", children: [
        /* @__PURE__ */ jsxs7("div", { class: "field", children: [
          /* @__PURE__ */ jsx7("label", { for: "password", children: "Password" }),
          /* @__PURE__ */ jsx7(
            "input",
            {
              id: "password",
              name: "password",
              type: "password",
              autocomplete: "current-password",
              required: true,
              autofocus: true,
              "aria-describedby": error ? "login-error" : void 0
            }
          )
        ] }),
        error ? /* @__PURE__ */ jsx7("p", { class: "err", id: "login-error", role: "alert", children: error }) : null,
        /* @__PURE__ */ jsx7("button", { class: "btn btn-primary", type: "submit", children: "Sign in" })
      ] })
    ] }) })
  ] })
] });

// src/ui/pages/playground.tsx
import { jsx as jsx8, jsxs as jsxs8 } from "hono/jsx/jsx-runtime";
var Playground = ({ data }) => {
  const families = Array.from(new Set(data.models.map((m) => m.family))).sort();
  return /* @__PURE__ */ jsxs8("div", { class: "stack playground-page", children: [
    /* @__PURE__ */ jsxs8("div", { class: "page-head", children: [
      /* @__PURE__ */ jsxs8("div", { children: [
        /* @__PURE__ */ jsx8("h1", { children: "Playground" }),
        /* @__PURE__ */ jsxs8("p", { class: "sub", children: [
          "Send a prompt through the router and inspect the response, the model that answered, and the latency. Every call goes through the same fallback chain as ",
          /* @__PURE__ */ jsx8("span", { class: "mono", children: "/v1" }),
          "."
        ] })
      ] }),
      /* @__PURE__ */ jsx8("div", { class: "head-actions", children: /* @__PURE__ */ jsx8("span", { class: data.live ? "stamp" : "stamp demo", children: data.live ? "live" : "demo data" }) })
    ] }),
    /* @__PURE__ */ jsx8(Section, { title: "Request", children: /* @__PURE__ */ jsx8("div", { class: "card", children: /* @__PURE__ */ jsxs8("form", { id: "playground-form", class: "playground-form", autocomplete: "off", children: [
      /* @__PURE__ */ jsxs8("div", { class: "pg-grid", children: [
        /* @__PURE__ */ jsxs8("div", { class: "field", children: [
          /* @__PURE__ */ jsx8("label", { for: "pg-model", children: "Model" }),
          /* @__PURE__ */ jsxs8("select", { id: "pg-model", name: "model", children: [
            /* @__PURE__ */ jsxs8("optgroup", { label: "Aliases", children: [
              /* @__PURE__ */ jsx8("option", { value: "auto", selected: true, children: "auto (fallback chain)" }),
              /* @__PURE__ */ jsx8("option", { value: "all", children: "all (every free model)" }),
              /* @__PURE__ */ jsx8("option", { value: "fast", children: "fast" }),
              /* @__PURE__ */ jsx8("option", { value: "smart", children: "smart" }),
              /* @__PURE__ */ jsx8("option", { value: "vision", children: "vision" }),
              /* @__PURE__ */ jsx8("option", { value: "tiptip", children: "tiptip (9router)" })
            ] }),
            /* @__PURE__ */ jsx8("optgroup", { label: "Model families", children: families.map((f) => /* @__PURE__ */ jsx8("option", { value: f, children: f })) })
          ] }),
          /* @__PURE__ */ jsxs8("p", { class: "help", children: [
            "Aliases walk the fallback chain. A family name or ",
            /* @__PURE__ */ jsx8("span", { class: "mono", children: "provider/model" }),
            " ",
            "pins the target."
          ] })
        ] }),
        /* @__PURE__ */ jsxs8("div", { class: "field", children: [
          /* @__PURE__ */ jsxs8("label", { for: "pg-system", children: [
            "System prompt ",
            /* @__PURE__ */ jsx8("span", { class: "dim", children: "(optional)" })
          ] }),
          /* @__PURE__ */ jsx8("input", { id: "pg-system", name: "system", type: "text", placeholder: "You are a helpful assistant." })
        ] })
      ] }),
      /* @__PURE__ */ jsxs8("div", { class: "field", children: [
        /* @__PURE__ */ jsx8("label", { for: "pg-prompt", children: "Prompt" }),
        /* @__PURE__ */ jsx8("textarea", { id: "pg-prompt", name: "prompt", rows: 6, placeholder: "Ask anything...", required: true })
      ] }),
      /* @__PURE__ */ jsxs8("div", { class: "pg-actions", children: [
        /* @__PURE__ */ jsx8("button", { class: "btn btn-primary", type: "submit", id: "pg-submit", children: "Send" }),
        /* @__PURE__ */ jsx8("button", { class: "btn btn-quiet", type: "button", id: "pg-clear", children: "Clear" }),
        /* @__PURE__ */ jsx8("span", { class: "pg-status", id: "pg-status", "aria-live": "polite" })
      ] })
    ] }) }) }),
    /* @__PURE__ */ jsx8(Section, { title: "Response", aside: "from /v1/chat/completions", children: /* @__PURE__ */ jsxs8("div", { class: "card pg-response-card", children: [
      /* @__PURE__ */ jsxs8("div", { class: "pg-meta", id: "pg-meta", hidden: true, children: [
        /* @__PURE__ */ jsx8("span", { class: "mark ok", id: "pg-meta-model" }),
        /* @__PURE__ */ jsx8("span", { class: "mark plain", id: "pg-meta-provider" }),
        /* @__PURE__ */ jsx8("span", { class: "num", id: "pg-meta-latency" }),
        /* @__PURE__ */ jsx8("span", { class: "num", id: "pg-meta-tokens" }),
        /* @__PURE__ */ jsx8("span", { class: "mark", id: "pg-meta-fallbacks", hidden: true })
      ] }),
      /* @__PURE__ */ jsx8("pre", { class: "pg-output", id: "pg-output", "aria-live": "polite", children: /* @__PURE__ */ jsx8("span", { class: "pg-placeholder", children: "Response will appear here." }) }),
      /* @__PURE__ */ jsx8("pre", { class: "pg-error", id: "pg-error", hidden: true })
    ] }) })
  ] });
};

// src/ui/pages/endpoint.tsx
import { raw as raw4 } from "hono/html";
import { jsx as jsx9, jsxs as jsxs9 } from "hono/jsx/jsx-runtime";
var COPY_ICON2 = '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6a3 3 0 0 0-3 3v6.5A2.5 2.5 0 0 0 5.5 15"/>';
var ALIASES = [
  ["auto", "the default fallback chain, most headroom first"],
  ["all", "every zero-cost model, mixed"],
  ["fast", "groq, then cerebras, then nvidia"],
  ["smart", "glm-5.3, then kimi-k3.1-pro"],
  ["vision", "gemma-4-31b-it, then gemini flash lite"],
  ["tiptip", "9router combo"]
];
var Endpoint = ({ base, apiKey }) => /* @__PURE__ */ jsxs9("div", { class: "stack settings", children: [
  /* @__PURE__ */ jsxs9("div", { class: "page-head", children: [
    /* @__PURE__ */ jsxs9("div", { children: [
      /* @__PURE__ */ jsx9("h1", { children: "Endpoint" }),
      /* @__PURE__ */ jsx9("p", { class: "sub", children: "Point any OpenAI-compatible client at this base URL and send the bearer token. Nothing else about the client changes." })
    ] }),
    /* @__PURE__ */ jsx9("div", { class: "head-actions", children: /* @__PURE__ */ jsx9("span", { class: "stamp", children: "openai-compatible" }) })
  ] }),
  /* @__PURE__ */ jsxs9("div", { class: "section-row", children: [
    /* @__PURE__ */ jsxs9("div", { class: "setting-col", children: [
      /* @__PURE__ */ jsx9("h2", { children: "Connection" }),
      /* @__PURE__ */ jsx9("p", { children: "Both values below are live. The key is shown in full once you reveal it; copy it into your client's environment rather than into a file that gets committed." })
    ] }),
    /* @__PURE__ */ jsxs9("div", { class: "panel", children: [
      /* @__PURE__ */ jsxs9("div", { class: "field", children: [
        /* @__PURE__ */ jsx9("label", { for: "base-url", children: "Base URL" }),
        /* @__PURE__ */ jsxs9("div", { class: "copy-field", children: [
          /* @__PURE__ */ jsx9("input", { id: "base-url", type: "text", readonly: true, value: base, "data-copy-source": true }),
          /* @__PURE__ */ jsxs9("button", { class: "btn btn-sm", type: "button", "data-copy-from": "base-url", children: [
            /* @__PURE__ */ jsx9("svg", { viewBox: "0 0 24 24", width: "13", height: "13", "aria-hidden": "true", children: raw4(COPY_ICON2) }),
            "Copy"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs9("div", { class: "field", children: [
        /* @__PURE__ */ jsx9("label", { for: "router-key", children: "API key" }),
        apiKey ? /* @__PURE__ */ jsxs9("div", { class: "copy-field", children: [
          /* @__PURE__ */ jsx9(
            "input",
            {
              id: "router-key",
              class: "mono-input",
              type: "password",
              readonly: true,
              value: apiKey,
              "data-reveal-target": true
            }
          ),
          /* @__PURE__ */ jsx9("button", { class: "btn btn-sm", type: "button", "data-reveal-toggle": "router-key", "aria-pressed": "false", children: "Reveal" }),
          /* @__PURE__ */ jsxs9("button", { class: "btn btn-sm", type: "button", "data-copy-from": "router-key", children: [
            /* @__PURE__ */ jsx9("svg", { viewBox: "0 0 24 24", width: "13", height: "13", "aria-hidden": "true", children: raw4(COPY_ICON2) }),
            "Copy"
          ] })
        ] }) : /* @__PURE__ */ jsx9("input", { id: "router-key", class: "mono-input", type: "text", readonly: true, value: "not set" }),
        /* @__PURE__ */ jsxs9("span", { class: "help", children: [
          "The value of ",
          /* @__PURE__ */ jsx9("span", { class: "mono", children: "ROUTER_KEY" }),
          ". A bearer token issued with",
          " ",
          /* @__PURE__ */ jsx9("span", { class: "mono", children: "POST /v1/keys" }),
          " also works."
        ] })
      ] }),
      /* @__PURE__ */ jsx9("div", { class: "alias-table", children: ALIASES.map(([name, what]) => /* @__PURE__ */ jsxs9("div", { class: "alias-row", children: [
        /* @__PURE__ */ jsx9("span", { class: "mono", children: name }),
        /* @__PURE__ */ jsx9("span", { class: "dim", children: what })
      ] })) })
    ] })
  ] }),
  /* @__PURE__ */ jsx9(Section, { title: "Ask for one", aside: "the model name is the only variable", children: /* @__PURE__ */ jsxs9("div", { class: "card", children: [
    /* @__PURE__ */ jsx9("pre", { class: "code", children: /* @__PURE__ */ jsx9("code", { children: `curl "${base}/chat/completions" \\
   -H "authorization: Bearer $ROUTER_KEY" \\
   -H "content-type: application/json" \\
   -d '{"model":"auto","stream":true,
        "messages":[{"role":"user","content":"hi"}]}'` }) }),
    /* @__PURE__ */ jsxs9("p", { class: "code-note", children: [
      "Swap ",
      /* @__PURE__ */ jsx9("span", { class: "mono", children: "auto" }),
      " for any alias or family from the Models page. Prefix a provider to pin the request \u2014 ",
      /* @__PURE__ */ jsx9("span", { class: "mono", children: "nvidia/glm-5.3" }),
      " skips the chain."
    ] })
  ] }) })
] });

// src/app.tsx
import { jsx as jsx10 } from "hono/jsx/jsx-runtime";
var app = new Hono();
function page(active, title, shortTitle, c, children) {
  return c.html(
    /* @__PURE__ */ jsx10(Layout, { title, active, shortTitle, alerts: 0, children })
  );
}
function notice(c) {
  const raw5 = c.req.query("notice");
  if (!raw5) return void 0;
  return raw5.slice(0, 240);
}
app.get("/", requireDashboard, async (c) => {
  const data = await loadDashboard();
  const metric = c.req.query("m") === "tokens" ? "tokens" : "requests";
  return page("overview", "Overview", "Overview", c, /* @__PURE__ */ jsx10(Overview, { data, metric }));
});
app.get("/models", requireDashboard, async (c) => {
  const data = await loadDashboard();
  const asked = c.req.query("f");
  const filter = asked === "tools" || asked === "vision" || asked === "long" ? asked : "all";
  return page("models", "Models", "Models", c, /* @__PURE__ */ jsx10(Models, { data, filter }));
});
app.get("/providers", requireDashboard, async (c) => {
  const routerKey = env.routerKey;
  const keyHint = routerKey ? `sk-\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${routerKey.slice(-4)}` : "not set";
  const data = await loadDashboard();
  return page(
    "providers",
    "Providers",
    "Providers",
    c,
    /* @__PURE__ */ jsx10(Providers, { base: `${new URL(c.req.url).origin}/v1`, keyHint, data, notice: notice(c) })
  );
});
app.get("/usage", requireDashboard, async (c) => {
  const data = await loadDashboard();
  const asked = c.req.query("m");
  const metric = asked === "tokens" || asked === "burn" ? asked : "requests";
  return page("usage", "Usage", "Usage", c, /* @__PURE__ */ jsx10(Usage, { data, metric }));
});
app.get("/playground", requireDashboard, async (c) => {
  const data = await loadDashboard();
  return page("playground", "Playground", "Playground", c, /* @__PURE__ */ jsx10(Playground, { data }));
});
app.get("/endpoint", requireDashboard, (c) => {
  const base = `${new URL(c.req.url).origin}/v1`;
  return page("endpoint", "Endpoint", "Endpoint", c, /* @__PURE__ */ jsx10(Endpoint, { base, apiKey: env.routerKey }));
});
function back(c, message) {
  return c.redirect(`/providers?notice=${encodeURIComponent(message)}`, 303);
}
app.post("/providers/keys", requireDashboard, async (c) => {
  const body = await c.req.parseBody();
  const providerId = String(body.provider ?? "").trim();
  const plaintext = String(body.key ?? "").trim();
  const label = String(body.label ?? "primary").trim() || "primary";
  if (!providerId || !plaintext) return back(c, "A provider and a key are both required.");
  if (!PROVIDERS_BY_ID.has(providerId)) return back(c, `Unknown provider "${providerId}".`);
  if (env.isDemo) {
    return back(c, "No DATABASE_URL is set, so nothing was stored. Add one and redeploy.");
  }
  try {
    const sealed = await sealKey(plaintext, providerId);
    await db().insert(providerKeys).values({
      id: generateId(),
      providerId,
      label,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      keyVersion: sealed.keyVersion,
      keyHint: sealed.keyHint
    });
    return back(c, `Key for ${PROVIDERS_BY_ID.get(providerId).name} sealed and stored.`);
  } catch (err) {
    return back(c, `Could not store the key: ${err.message}`);
  }
});
app.post("/providers/limits", requireDashboard, async (c) => {
  const body = await c.req.parseBody();
  const rows = [];
  for (const [name, value] of Object.entries(body)) {
    if (!name.startsWith("limit_")) continue;
    const providerId = name.slice("limit_".length);
    const maxRequests = Number(value);
    if (!PROVIDERS_BY_ID.has(providerId)) continue;
    if (!Number.isFinite(maxRequests) || maxRequests < 0) continue;
    rows.push({ providerId, maxRequests: Math.floor(maxRequests) });
  }
  if (env.isDemo) return back(c, `No DATABASE_URL is set, so the ${rows.length} limits were not saved.`);
  try {
    for (const row of rows) {
      await db().insert(quotaLimits).values({ providerId: row.providerId, modelId: "", bucketKind: "day", maxRequests: row.maxRequests }).onConflictDoUpdate({
        target: [quotaLimits.providerId, quotaLimits.modelId, quotaLimits.bucketKind],
        set: { maxRequests: row.maxRequests }
      });
    }
    return back(c, `${rows.length} daily limits saved.`);
  } catch (err) {
    return back(c, `Could not save limits: ${err.message}`);
  }
});
app.post("/providers/sync", requireDashboard, async (c) => {
  if (env.isDemo) return back(c, "No DATABASE_URL is set. Run `npm run sync` with keys in the env instead.");
  try {
    const results = await syncCatalog(async (providerId) => {
      const rows = await db().select().from(providerKeys).where(eq5(providerKeys.providerId, providerId)).limit(1);
      if (rows.length === 0) return null;
      const { openKeyCached: openKeyCached2 } = await Promise.resolve().then(() => (init_keys(), keys_exports));
      return openKeyCached2({
        id: rows[0].id,
        ciphertext: rows[0].ciphertext,
        iv: rows[0].iv,
        keyVersion: rows[0].keyVersion,
        providerId
      });
    });
    const ok = results.filter((r) => r.ok).length;
    const total = results.reduce((a, r) => a + (r.count ?? 0), 0);
    return back(c, `Synced ${ok} of ${results.length} providers \xB7 ${total} endpoints.`);
  } catch (err) {
    return back(c, `Sync failed: ${err.message}`);
  }
});
app.get("/login", (c) => c.html(/* @__PURE__ */ jsx10(Login, {})));
app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const password = String(body.password ?? "");
  if (await signIn(c, password)) return c.redirect("/", 303);
  return c.html(/* @__PURE__ */ jsx10(Login, { error: "That password does not match." }), 401);
});
app.get("/logout", (c) => {
  signOut(c);
  return c.redirect("/login", 303);
});
app.post("/api/playground/chat", requireDashboard, async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: "invalid_json", message: "The request body is not valid JSON." } }, 400);
  }
  if (!body || typeof body.model !== "string" || !Array.isArray(body.messages)) {
    return c.json(
      { error: { code: "invalid_request", message: "Expected { model, messages }." } },
      400
    );
  }
  body.stream = false;
  const result = await routeChat(body, c.req.raw.signal);
  if (!result.ok) {
    return c.json(
      { error: { code: result.code, message: result.detail, attempts: result.attempts } },
      result.status
    );
  }
  const { response, candidate, fallbacks, attempts } = result;
  let payload;
  let tokens = 0;
  try {
    payload = await response.clone().json();
    tokens = Number(payload?.usage?.total_tokens ?? 0);
  } catch {
    return c.json(
      { error: { code: "bad_upstream", message: "The upstream response was not valid JSON." } },
      502
    );
  }
  void recordUsage(candidate.providerId, tokens).catch(() => {
  });
  return c.json({
    ...payload,
    router: {
      provider: candidate.providerId,
      family: candidate.family,
      model_id: candidate.family,
      fallbacks,
      latency_ms: attempts.at(-1)?.ms ?? null,
      attempts
    }
  });
});
app.get("/healthz", (c) => c.json({ ok: true, demo: env.isDemo }));
app.get("/v1/models", requireRouterKey, async (c) => {
  const created = Math.floor(Date.now() / 1e3);
  const ids = ["auto", "fast", "smart", "vision", "tiptip", "all"];
  const data = await loadDashboard();
  for (const row of data.models) ids.push(row.family);
  for (const row of data.models) {
    for (const providerId of row.providers) ids.push(`${providerId}/${row.family}`);
  }
  const seen = /* @__PURE__ */ new Set();
  const list = ids.filter((id) => seen.has(id) ? false : (seen.add(id), true)).map((id) => ({ id, object: "model", created, owned_by: "router" }));
  return c.json({ object: "list", data: list });
});
app.post("/v1/chat/completions", requireRouterKey, async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: "invalid_json", message: "The request body is not valid JSON." } }, 400);
  }
  const result = await routeChat(body, c.req.raw.signal);
  if (!result.ok) {
    return c.json(
      { error: { code: result.code, message: result.detail, attempts: result.attempts } },
      result.status
    );
  }
  const { response, candidate, fallbacks } = result;
  const headers = {
    "x-router-provider": candidate.providerId,
    "x-router-model": candidate.family,
    "x-router-fallbacks": String(fallbacks)
  };
  const contentType = response.headers.get("content-type") ?? "application/json";
  if (contentType.includes("text/event-stream") && response.body) {
    void recordUsage(candidate.providerId, 0).catch(() => {
    });
    return c.body(response.body, 200, {
      ...headers,
      "content-type": contentType,
      "cache-control": "no-cache, no-transform"
    });
  }
  const json = await response.json();
  void recordUsage(candidate.providerId, Number(json.usage?.total_tokens ?? 0)).catch(() => {
  });
  return c.json(json, 200, {
    ...headers,
    "content-type": "application/json"
  });
});
app.post("/v1/keys", requireDashboard, async (c) => {
  if (env.isDemo) return c.json({ error: { message: "No DATABASE_URL is set." } }, 400);
  const plaintext = generateApiKey();
  await db().insert(apiKeys).values({
    id: generateId(),
    keyHash: await hashApiKey(plaintext),
    label: `issued ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`
  });
  return c.json({ key: plaintext, note: "Shown once. Store it now." });
});
app.onError((err, c) => {
  if (c.req.path.startsWith("/v1/")) {
    return c.json({ error: { code: "internal", message: err.message } }, 500);
  }
  return c.text(`Router error: ${err.message}`, 500);
});
app.notFound(
  (c) => c.req.path.startsWith("/v1/") ? c.json({ error: { code: "not_found", message: "No such endpoint." } }, 404) : c.text("Not found", 404)
);
var app_default = app;

// scripts/vercel-entry.ts
var config = { runtime: "nodejs", maxDuration: 300 };
var handler = handle(app_default);
export {
  handler as DELETE,
  handler as GET,
  handler as HEAD,
  handler as OPTIONS,
  handler as PATCH,
  handler as POST,
  handler as PUT,
  config,
  handler
};
