import { Hono } from 'hono';
import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { requireDashboard, requireRouterKey, signIn, signOut } from './auth.ts';
import { env } from './env.ts';
import { db } from './db/client.ts';
import { apiKeys, providerKeys, quotaLimits } from './db/schema.ts';
import { generateApiKey, generateId, hashApiKey, sealKey } from './crypto/keys.ts';
import { routeChat } from './router/core.ts';
import { recordUsage } from './quota/buckets.ts';
import { PROVIDERS_BY_ID } from './providers/catalog.ts';
import { syncCatalog } from './models/sync.ts';
import { MODEL_ROWS, PROVIDER_USAGE } from './data/demo.ts';
import { Layout, type NavId } from './ui/layout.tsx';
import { Overview, type OverviewMetric } from './ui/pages/overview.tsx';
import { Models, type ModelFilter } from './ui/pages/models.tsx';
import { Providers } from './ui/pages/providers.tsx';
import { Usage, type UsageMetric } from './ui/pages/usage.tsx';
import { Login } from './ui/pages/login.tsx';
import { Playground } from './ui/pages/playground.tsx';

const app = new Hono();

const ALERTS = PROVIDER_USAGE.filter((p) => p.status === 'degraded').length;

function page(active: NavId, title: string, shortTitle: string, c: Context, children: unknown) {
  return c.html(
    <Layout title={title} active={active} shortTitle={shortTitle} alerts={ALERTS}>
      {children}
    </Layout>,
  );
}

function notice(c: Context): string | undefined {
  const raw = c.req.query('notice');
  if (!raw) return undefined;
  return raw.slice(0, 240);
}

/* ── dashboard ───────────────────────────────────────────────────────────── */

app.get('/', requireDashboard, (c) => {
  const metric: OverviewMetric = c.req.query('m') === 'tokens' ? 'tokens' : 'requests';
  return page('overview', 'Overview', 'Overview', c, <Overview metric={metric} />);
});

app.get('/models', requireDashboard, (c) => {
  const asked = c.req.query('f');
  const filter: ModelFilter =
    asked === 'tools' || asked === 'vision' || asked === 'long' ? asked : 'all';
  return page('models', 'Models', 'Models', c, <Models filter={filter} />);
});

app.get('/providers', requireDashboard, (c) => {
  const routerKey = env.routerKey;
  const keyHint = routerKey ? `sk-••••••••••••${routerKey.slice(-4)}` : 'not set';
  return page(
    'providers',
    'Providers',
    'Providers',
    c,
    <Providers base={`${new URL(c.req.url).origin}/v1`} keyHint={keyHint} notice={notice(c)} />,
  );
});

app.get('/usage', requireDashboard, (c) => {
  const asked = c.req.query('m');
  const metric: UsageMetric = asked === 'tokens' || asked === 'burn' ? asked : 'requests';
  return page('usage', 'Usage', 'Usage', c, <Usage metric={metric} />);
});

app.get('/playground', requireDashboard, (c) => {
  return page('playground', 'Playground', 'Playground', c, <Playground />);
});

/* ── dashboard writes ────────────────────────────────────────────────────── */

function back(c: Context, message: string) {
  return c.redirect(`/providers?notice=${encodeURIComponent(message)}`, 303);
}

app.post('/providers/keys', requireDashboard, async (c) => {
  const body = await c.req.parseBody();
  const providerId = String(body.provider ?? '').trim();
  const plaintext = String(body.key ?? '').trim();
  const label = String(body.label ?? 'primary').trim() || 'primary';

  if (!providerId || !plaintext) return back(c, 'A provider and a key are both required.');
  if (!PROVIDERS_BY_ID.has(providerId)) return back(c, `Unknown provider "${providerId}".`);
  if (env.isDemo) {
    return back(c, 'No DATABASE_URL is set, so nothing was stored. Add one and redeploy.');
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
      keyHint: sealed.keyHint,
    });
    return back(c, `Key for ${PROVIDERS_BY_ID.get(providerId)!.name} sealed and stored.`);
  } catch (err) {
    return back(c, `Could not store the key: ${(err as Error).message}`);
  }
});

app.post('/providers/limits', requireDashboard, async (c) => {
  const body = await c.req.parseBody();
  const rows: Array<{ providerId: string; maxRequests: number }> = [];
  for (const [name, value] of Object.entries(body)) {
    if (!name.startsWith('limit_')) continue;
    const providerId = name.slice('limit_'.length);
    const maxRequests = Number(value);
    if (!PROVIDERS_BY_ID.has(providerId)) continue;
    if (!Number.isFinite(maxRequests) || maxRequests < 0) continue;
    rows.push({ providerId, maxRequests: Math.floor(maxRequests) });
  }
  if (env.isDemo) return back(c, `No DATABASE_URL is set, so the ${rows.length} limits were not saved.`);

  try {
    for (const row of rows) {
      await db()
        .insert(quotaLimits)
        .values({ providerId: row.providerId, modelId: '', bucketKind: 'day', maxRequests: row.maxRequests })
        .onConflictDoUpdate({
          target: [quotaLimits.providerId, quotaLimits.modelId, quotaLimits.bucketKind],
          set: { maxRequests: row.maxRequests },
        });
    }
    return back(c, `${rows.length} daily limits saved.`);
  } catch (err) {
    return back(c, `Could not save limits: ${(err as Error).message}`);
  }
});

/**
 * The route and the CLI script share one implementation, so a sync run from the
 * console and a sync run from a terminal cannot drift apart.
 */
app.post('/providers/sync', requireDashboard, async (c) => {
  if (env.isDemo) return back(c, 'No DATABASE_URL is set. Run `npm run sync` with keys in the env instead.');

  try {
    const results = await syncCatalog(async (providerId) => {
      const rows = await db()
        .select()
        .from(providerKeys)
        .where(eq(providerKeys.providerId, providerId))
        .limit(1);
      if (rows.length === 0) return null;
      const { openKeyCached } = await import('./crypto/keys.ts');
      return openKeyCached({
        id: rows[0].id,
        ciphertext: rows[0].ciphertext,
        iv: rows[0].iv,
        keyVersion: rows[0].keyVersion,
        providerId,
      });
    });
    const ok = results.filter((r) => r.ok).length;
    const total = results.reduce((a, r) => a + (r.count ?? 0), 0);
    return back(c, `Synced ${ok} of ${results.length} providers · ${total} endpoints.`);
  } catch (err) {
    return back(c, `Sync failed: ${(err as Error).message}`);
  }
});

/* ── session ─────────────────────────────────────────────────────────────── */

app.get('/login', (c) => c.html(<Login />));

app.post('/login', async (c) => {
  const body = await c.req.parseBody();
  const password = String(body.password ?? '');
  if (await signIn(c, password)) return c.redirect('/', 303);
  return c.html(<Login error="That password does not match." />, 401);
});

app.get('/logout', (c) => {
  signOut(c);
  return c.redirect('/login', 303);
});

/* ── the OpenAI-compatible surface ───────────────────────────────────────── */

app.post('/api/playground/chat', requireDashboard, async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: 'invalid_json', message: 'The request body is not valid JSON.' } }, 400);
  }

  if (!body || typeof body.model !== 'string' || !Array.isArray(body.messages)) {
    return c.json(
      { error: { code: 'invalid_request', message: 'Expected { model, messages }.' } },
      400,
    );
  }

  body.stream = false;

  const result = await routeChat(body, c.req.raw.signal);
  if (!result.ok) {
    return c.json(
      { error: { code: result.code, message: result.detail, attempts: result.attempts } },
      result.status as any,
    );
  }

  const { response, candidate, fallbacks, attempts } = result;
  let payload: any;
  let tokens = 0;
  try {
    payload = await response.clone().json();
    tokens = Number(payload?.usage?.total_tokens ?? 0);
  } catch {
    return c.json(
      { error: { code: 'bad_upstream', message: 'The upstream response was not valid JSON.' } },
      502,
    );
  }

  void recordUsage(candidate.providerId, tokens).catch(() => {});

  return c.json({
    ...payload,
    router: {
      provider: candidate.providerId,
      family: candidate.family,
      model_id: candidate.family,
      fallbacks,
      latency_ms: attempts.at(-1)?.ms ?? null,
      attempts,
    },
  });
});

app.get('/healthz', (c) => c.json({ ok: true, demo: env.isDemo }));

app.get('/v1/models', requireRouterKey, (c) => {
  const created = Math.floor(Date.now() / 1000);
  const ids: string[] = ['auto', 'fast', 'smart', 'vision', 'tiptip'];
  for (const row of MODEL_ROWS) ids.push(row.family);
  for (const row of MODEL_ROWS) {
    for (const providerId of row.providers) ids.push(`${providerId}/${row.family}`);
  }
  const seen = new Set<string>();
  const data = ids
    .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
    .map((id) => ({ id, object: 'model', created, owned_by: 'router' }));
  return c.json({ object: 'list', data });
});

app.post('/v1/chat/completions', requireRouterKey, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: 'invalid_json', message: 'The request body is not valid JSON.' } },
      400,
    );
  }

  const result = await routeChat(body, c.req.raw.signal);

  if (!result.ok) {
    return c.json(
      {
        error: {
          code: result.code,
          message: result.detail,
          attempts: result.attempts,
        },
      },
      result.status as 400,
    );
  }

  const { response, candidate, fallbacks } = result;
  const headers: Record<string, string> = {
    'x-router-provider': candidate.providerId,
    'x-router-model': candidate.family,
    'x-router-fallbacks': String(fallbacks),
  };

  const contentType = response.headers.get('content-type') ?? 'application/json';

  if (contentType.includes('text/event-stream') && response.body) {
    // The count is committed before the first byte: the quota was spent the
    // moment the upstream answered with headers. Tokens on a stream are settled
    // by the provider's trailing usage frame, which we do not parse here.
    void recordUsage(candidate.providerId, 0).catch(() => {});
    return c.body(response.body, 200, {
      ...headers,
      'content-type': contentType,
      'cache-control': 'no-cache, no-transform',
    });
  }

  const json = (await response.json()) as {
    usage?: { total_tokens?: number };
  };
  void recordUsage(candidate.providerId, Number(json.usage?.total_tokens ?? 0)).catch(() => {});
  return c.json(json as Record<string, unknown>, 200, {
    ...headers,
    'content-type': 'application/json',
  });
});

/* ── router API keys ─────────────────────────────────────────────────────── */

app.post('/v1/keys', requireDashboard, async (c) => {
  if (env.isDemo) return c.json({ error: { message: 'No DATABASE_URL is set.' } }, 400);
  const plaintext = generateApiKey();
  await db().insert(apiKeys).values({
    id: generateId(),
    keyHash: await hashApiKey(plaintext),
    label: `issued ${new Date().toISOString().slice(0, 10)}`,
  });
  return c.json({ key: plaintext, note: 'Shown once. Store it now.' });
});

/* ── errors ──────────────────────────────────────────────────────────────── */

app.onError((err, c) => {
  if (c.req.path.startsWith('/v1/')) {
    return c.json({ error: { code: 'internal', message: err.message } }, 500);
  }
  return c.text(`Router error: ${err.message}`, 500);
});

app.notFound((c) =>
  c.req.path.startsWith('/v1/')
    ? c.json({ error: { code: 'not_found', message: 'No such endpoint.' } }, 404)
    : c.text('Not found', 404),
);

export default app;
