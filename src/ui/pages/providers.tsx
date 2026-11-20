import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';
import { PROVIDERS_OFF, PROVIDER_USAGE, burn, providerName, thousands } from '../../data/demo.ts';
import { Mark, Section, statusOf } from '../components.tsx';

const COPY_ICON =
  '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6a3 3 0 0 0-3 3v6.5A2.5 2.5 0 0 0 5.5 15"/>';

const ALIASES: Array<[string, string]> = [
  ['auto', '8 hops, most headroom first'],
  ['fast', 'groq, then cerebras, then nvidia'],
  ['smart', 'glm-5.3, then kimi-k3.1-pro'],
  ['vision', 'gemma-4-31b-it, then gemini flash lite'],
];

export interface ProvidersProps {
  /** Origin + /v1, built from the request so the copy button gives a real URL. */
  base: string;
  /** Masked router key: last four characters only. */
  keyHint: string;
  notice?: string;
}

export const Providers: FC<ProvidersProps> = (props) => {
  const nearCap = PROVIDER_USAGE.filter((p) => burn(p) > 0.8);
  const keyed = PROVIDER_USAGE.filter((p) => p.keys > 0).length;

  return (
    <div class="stack settings">
      <div class="page-head">
        <div>
          <h1>Providers</h1>
          <p class="sub">
            {keyed} keyed providers and one keyless endpoint. Keys are sealed with AES-256-GCM before
            they reach Postgres; the router holds one decrypted key for the length of a request.
          </p>
        </div>
        <div class="head-actions">
          <span class="stamp">11 of 15 configured</span>
        </div>
      </div>

      {props.notice ? (
        <div class="notice" role="status">
          {props.notice}
        </div>
      ) : null}

      <div class="section-row">
        <div class="setting-col">
          <h2>Provider keys</h2>
          <p>
            One row per provider. Replace rotates the key without dropping the provider out of the
            chain; the old key stops being selected immediately.
          </p>
          <p class="summary">
            {nearCap.length} providers are past 80% of their ceiling:{' '}
            {nearCap.map((p) => p.name).join(', ')}.
          </p>
        </div>
        <div>
          <div class="panel">
            {PROVIDER_USAGE.map((p) => {
              const s = statusOf(p);
              return (
                <div class="key-row">
                  <div class="kl">
                    <span class="lbl">
                      {p.name}
                      {p.keys > 1 ? <span class="keys"> {p.keys} keys</span> : null}
                    </span>
                    <span class="hint">
                      {p.keyHint ? `sk-••••••••••••${p.keyHint}` : 'no key needed'} · {p.keyAge}
                    </span>
                  </div>
                  <Mark tone={s.tone}>{s.label}</Mark>
                  <div class="acts">
                    <button class="btn btn-sm btn-quiet" type="button" data-prefill={p.id}>
                      {p.keyHint ? 'Replace' : 'Add key'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {PROVIDERS_OFF.length > 0 ? (
            <p class="off-list">
              Not configured: {PROVIDERS_OFF.map((p) => `${p.name} (${p.reason})`).join(' · ')}
            </p>
          ) : null}

          <form class="panel add-key" method="post" action="/providers/keys">
            <div class="field">
              <label for="pk-provider">Provider</label>
              <select id="pk-provider" name="provider" data-provider-select required>
                {PROVIDER_USAGE.map((p) => (
                  <option value={p.id}>{p.name}</option>
                ))}
                {PROVIDERS_OFF.map((p) => (
                  <option value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div class="field">
              <label for="pk-key">API key</label>
              <input
                id="pk-key"
                name="key"
                type="password"
                autocomplete="off"
                spellcheck={false}
                required
                aria-describedby="pk-help"
              />
              <span class="help" id="pk-help">
                Sealed in the same request that stores it. Only the last four characters are kept in
                the clear.
              </span>
            </div>
            <div class="field">
              <label for="pk-label">Label</label>
              <input id="pk-label" name="label" type="text" value="primary" />
            </div>
            <button class="btn btn-primary" type="submit">
              Add key
            </button>
          </form>
        </div>
      </div>

      <div class="section-row">
        <div class="setting-col">
          <h2>Daily limits</h2>
          <p>
            The ceiling the router will not cross for each provider, in requests per UTC day. Zero
            means no cap: the provider is tried last, never filtered out.
          </p>
          <p class="summary">
            {thousands(PROVIDER_USAGE.reduce((a, p) => a + p.limit, 0))} requests a day in total,
            of which {thousands(PROVIDER_USAGE.reduce((a, p) => a + p.used, 0))} are spent.
          </p>
        </div>
        <div class="panel">
          <form method="post" action="/providers/limits">
            {PROVIDER_USAGE.map((p) => (
              <div class="switch-row">
                <div class="sr-main">
                  <div class="sr-title">{p.name}</div>
                  <div class="sr-desc">
                    {thousands(p.used)} used today · p95 {thousands(p.p95)} ms
                    {p.rateLimited > 0 ? ` · ${p.rateLimited} rate-limited` : ''}
                  </div>
                </div>
                <input
                  class="limit-input"
                  type="number"
                  name={`limit_${p.id}`}
                  value={String(p.limit)}
                  min="0"
                  step="50"
                  aria-label={`${p.name} daily request limit`}
                />
              </div>
            ))}
            <button class="btn btn-primary save" type="submit">
              Save limits
            </button>
          </form>
        </div>
      </div>

      <div class="section-row">
        <div class="setting-col">
          <h2>Router endpoint</h2>
          <p>
            Point any OpenAI client at this base URL and send the bearer token. Nothing else about
            the client changes.
          </p>
        </div>
        <div class="panel">
          <div class="field">
            <label for="base-url">Base URL</label>
            <div class="copy-field">
              <input id="base-url" type="text" readonly value={props.base} data-copy-source />
              <button class="btn btn-sm" type="button" data-copy-from="base-url">
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                  {raw(COPY_ICON)}
                </svg>
                Copy
              </button>
            </div>
          </div>
          <div class="field">
            <label for="router-key">Bearer token</label>
            <input id="router-key" class="mono-input" type="text" readonly value={props.keyHint} />
            <span class="help">
              Set in <span class="mono">ROUTER_KEY</span>. The full value is never rendered here.
            </span>
          </div>
          <div class="alias-table">
            {ALIASES.map(([name, what]) => (
              <div class="alias-row">
                <span class="mono">{name}</span>
                <span class="dim">{what}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div class="section-row">
        <div class="setting-col">
          <h2>Catalog sync</h2>
          <p>
            Pulls each provider's model list and marks anything that disappeared as disabled. Run it
            after adding a key, and whenever a family starts returning 404.
          </p>
        </div>
        <div class="panel">
          <div class="switch-row">
            <div class="sr-main">
              <div class="sr-title">Last sync</div>
              <div class="sr-desc">4 hours ago · 32 endpoints across 11 providers</div>
            </div>
            <form method="post" action="/providers/sync">
              <button class="btn" type="submit">
                Sync now
              </button>
            </form>
          </div>
          <p class="help">
            A sync is one request per provider. Providers whose key is missing are skipped, not
            retried.
          </p>
        </div>
      </div>
    </div>
  );
};
