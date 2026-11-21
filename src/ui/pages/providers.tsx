import type { FC } from 'hono/jsx';
import { burn, thousands } from '../../data/demo.ts';
import type { DashboardData } from '../../data/index.ts';
import { Mark, Section, statusOf } from '../components.tsx';

export interface ProvidersProps {
  /** Origin + /v1, built from the request so the copy button gives a real URL. */
  base: string;
  /** Masked router key: last four characters only. */
  keyHint: string;
  data: DashboardData;
  notice?: string;
}

export const Providers: FC<ProvidersProps> = (props) => {
  const usage = props.data.usage;
  const nearCap = usage.filter((p) => burn(p) > 0.8);
  const keyed = usage.filter((p) => p.keys > 0).length;

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
          <span class="stamp">{usage.length} of {props.data.off.length} configured</span>
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
            {usage.map((p) => {
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

          {props.data.off.length > 0 ? (
            <p class="off-list">
              Not configured: {props.data.off.map((p) => `${p.name} (${p.reason})`).join(' · ')}
            </p>
          ) : null}

          <form class="panel add-key" method="post" action="/providers/keys">
            <div class="field">
              <label for="pk-provider">Provider</label>
              <select id="pk-provider" name="provider" data-provider-select required>
                {usage.map((p) => (
                  <option value={p.id}>{p.name}</option>
                ))}
                {props.data.off.map((p) => (
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
            {thousands(usage.reduce((a, p) => a + p.limit, 0))} requests a day in total, of which{' '}
            {thousands(usage.reduce((a, p) => a + p.used, 0))} are spent.
          </p>
        </div>
        <div class="panel">
          <form method="post" action="/providers/limits">
            {usage.map((p) => (
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
              <div class="sr-desc">Synced on demand from the Sync button below</div>
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