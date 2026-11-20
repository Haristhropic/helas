/**
 * Upstream adapters.
 *
 * Roughly four fifths of the free-tier world speaks the OpenAI chat-completions
 * shape, so there is one adapter for it and a thin variant for Cloudflare, whose
 * path carries the account id. Anything genuinely different (a browser-automation
 * provider, a web-UI scrape) does not belong here — it cannot survive a
 * serverless request. See the report for why g4f-style providers are excluded.
 */
import type { AdapterKind, ProviderDef } from './catalog.ts';
import { resolveBaseUrl } from './catalog.ts';

export interface UpstreamRequest {
  provider: ProviderDef;
  apiKey: string | null;
  body: unknown;
  accountId?: string;
  signal: AbortSignal;
}

export interface UpstreamOk {
  ok: true;
  response: Response;
}

export interface UpstreamFail {
  ok: false;
  status: number;
  /** Short, stable code for the health table: 'rate_limit', 'auth', 'server', ... */
  code: string;
  detail: string;
  retryAfterMs?: number;
}

export type UpstreamResult = UpstreamOk | UpstreamFail;

/**
 * Time allowed for upstream headers. A free tier can sit in a queue before its
 * first byte, so this is deliberately generous: the cost of waiting is one slow
 * hop, and the chain still moves on when the timer fires.
 */
const TIMEOUT_MS = 15000;

function classify(status: number): string {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'quota_paid';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  if (status === 400 || status === 422) return 'bad_request';
  return 'unknown';
}

/** A 4xx that is our fault should not be retried against another provider. */
export function isRetryable(status: number): boolean {
  return status === 429 || status === 402 || status === 408 || status >= 500;
}

function buildHeaders(kind: AdapterKind, apiKey: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'text/event-stream, application/json',
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  if (kind === 'openai') headers['http-referer'] = 'https://github.com/local/ai-router';
  return headers;
}

function buildUrl(provider: ProviderDef, accountId?: string): string {
  if (provider.adapter === 'cloudflare') {
    if (!accountId) throw new Error('cloudflare provider needs CLOUDFLARE_ACCOUNT_ID');
    return `${resolveBaseUrl(provider, accountId)}/chat/completions`;
  }
  return `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;
}

export async function callChatCompletions(req: UpstreamRequest): Promise<UpstreamResult> {
  const { provider, apiKey, body, accountId } = req;

  // One abort controller covers our own timeout and the caller's cancellation.
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  req.signal.addEventListener('abort', onAbort);

  try {
    const response = await fetch(buildUrl(provider, accountId), {
      method: 'POST',
      headers: buildHeaders(provider.adapter, apiKey),
      body: JSON.stringify(body),
      signal: timeout.signal,
    });

    if (response.ok) {
      return { ok: true, response };
    }

    // Read a bounded slice of the error body for the health table. Providers
    // sometimes return HTML or an enormous JSON blob; 600 chars is enough to
    // classify and never enough to bloat a log row.
    let detail = '';
    try {
      const text = await response.text();
      detail = text.slice(0, 600);
    } catch {
      /* body already gone */
    }

    const retryAfter = response.headers.get('retry-after');
    return {
      ok: false,
      status: response.status,
      code: classify(response.status),
      detail,
      retryAfterMs: retryAfter ? Number(retryAfter) * 1000 : undefined,
    };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    return {
      ok: false,
      status: aborted ? 408 : 502,
      code: aborted ? 'timeout' : 'network',
      detail: (err as Error)?.message?.slice(0, 300) ?? 'unknown transport error',
    };
  } finally {
    clearTimeout(timer);
    req.signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Model listing. Used by scripts/sync-models.ts, not on the request path.
 * Providers disagree about the envelope: most wrap in `{data:[...]}`, Cloudflare
 * wraps in `{result:[...]}`.
 */
export async function listModels(
  provider: ProviderDef,
  apiKey: string | null,
  accountId?: string,
): Promise<Array<{ id: string; contextLength?: number }>> {
  const url =
    provider.adapter === 'cloudflare'
      ? `${resolveBaseUrl(provider, accountId)}/models`
      : `${provider.baseUrl.replace(/\/$/, '')}/models`;

  const response = await fetch(url, {
    headers: buildHeaders(provider.adapter, apiKey),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${provider.id}: HTTP ${response.status}`);

  const json = (await response.json()) as Record<string, any>;
  const rows = Array.isArray(json.data) ? json.data : Array.isArray(json.result) ? json.result : [];
  return rows
    .map((row: any) => ({
      id: String(row.id ?? row.name ?? ''),
      contextLength: row.context_length ?? row.context_window ?? undefined,
    }))
    .filter((row: { id: string }) => row.id.length > 0);
}
