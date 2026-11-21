import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';
import { Section } from '../components.tsx';

const COPY_ICON =
  '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6a3 3 0 0 0-3 3v6.5A2.5 2.5 0 0 0 5.5 15"/>';

const ALIASES: Array<[string, string]> = [
  ['auto', 'the default fallback chain, most headroom first'],
  ['all', 'every zero-cost model, mixed'],
  ['fast', 'groq, then cerebras, then nvidia'],
  ['smart', 'glm-5.3, then kimi-k3.1-pro'],
  ['vision', 'gemma-4-31b-it, then gemini flash lite'],
  ['tiptip', '9router combo'],
];

export interface EndpointProps {
  /** Origin + /v1, built from the request so the copy button gives a real URL. */
  base: string;
  /** The real router bearer token. Rendered behind dashboard auth only. */
  apiKey: string;
}

export const Endpoint: FC<EndpointProps> = ({ base, apiKey }) => (
  <div class="stack settings">
    <div class="page-head">
      <div>
        <h1>Endpoint</h1>
        <p class="sub">
          Point any OpenAI-compatible client at this base URL and send the bearer token. Nothing else
          about the client changes.
        </p>
      </div>
      <div class="head-actions">
        <span class="stamp">openai-compatible</span>
      </div>
    </div>

    <div class="section-row">
      <div class="setting-col">
        <h2>Connection</h2>
        <p>
          Both values below are live. The key is shown in full once you reveal it; copy it into your
          client's environment rather than into a file that gets committed.
        </p>
      </div>
      <div class="panel">
        <div class="field">
          <label for="base-url">Base URL</label>
          <div class="copy-field">
            <input id="base-url" type="text" readonly value={base} data-copy-source />
            <button class="btn btn-sm" type="button" data-copy-from="base-url">
              <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                {raw(COPY_ICON)}
              </svg>
              Copy
            </button>
          </div>
        </div>

        <div class="field">
          <label for="router-key">API key</label>
          {apiKey ? (
            <div class="copy-field">
              <input
                id="router-key"
                class="mono-input"
                type="password"
                readonly
                value={apiKey}
                data-reveal-target
              />
              <button class="btn btn-sm" type="button" data-reveal-toggle="router-key" aria-pressed="false">
                Reveal
              </button>
              <button class="btn btn-sm" type="button" data-copy-from="router-key">
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                  {raw(COPY_ICON)}
                </svg>
                Copy
              </button>
            </div>
          ) : (
            <input id="router-key" class="mono-input" type="text" readonly value="not set" />
          )}
          <span class="help">
            The value of <span class="mono">ROUTER_KEY</span>. A bearer token issued with{' '}
            <span class="mono">POST /v1/keys</span> also works.
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

    <Section title="Ask for one" aside="the model name is the only variable">
      <div class="card">
        <pre class="code">
          <code>{`curl "${base}/chat/completions" \\
   -H "authorization: Bearer $ROUTER_KEY" \\
   -H "content-type: application/json" \\
   -d '{"model":"auto","stream":true,
        "messages":[{"role":"user","content":"hi"}]}'`}</code>
        </pre>
        <p class="code-note">
          Swap <span class="mono">auto</span> for any alias or family from the Models page. Prefix a
          provider to pin the request — <span class="mono">nvidia/glm-5.3</span> skips the chain.
        </p>
      </div>
    </Section>
  </div>
);