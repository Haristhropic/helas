import type { FC } from 'hono/jsx';
import type { DashboardData } from '../../data/index.ts';
import { Section } from '../components.tsx';

export const Playground: FC<{ data: DashboardData }> = ({ data }) => {
  const families = Array.from(new Set(data.models.map((m) => m.family))).sort();

  return (
    <div class="stack playground-page">
      <div class="page-head">
        <div>
          <h1>Playground</h1>
          <p class="sub">
            Send a prompt through the router and inspect the response, the model that answered, and the
            latency. Every call goes through the same fallback chain as <span class="mono">/v1</span>.
          </p>
        </div>
        <div class="head-actions">
          <span class={data.live ? 'stamp' : 'stamp demo'}>{data.live ? 'live' : 'demo data'}</span>
        </div>
      </div>

      <Section title="Request">
        <div class="card">
          <form id="playground-form" class="playground-form" autocomplete="off">
            <div class="pg-grid">
              <div class="field">
                <label for="pg-model">Model</label>
                <select id="pg-model" name="model">
                  <optgroup label="Aliases">
                    <option value="auto" selected>auto (fallback chain)</option>
                    <option value="all">all (every free model)</option>
                    <option value="fast">fast</option>
                    <option value="smart">smart</option>
                    <option value="vision">vision</option>
                    <option value="tiptip">tiptip (9router)</option>
                  </optgroup>
                  <optgroup label="Model families">
                    {families.map((f) => (
                      <option value={f}>{f}</option>
                    ))}
                  </optgroup>
                </select>
                <p class="help">
                  Aliases walk the fallback chain. A family name or <span class="mono">provider/model</span>{' '}
                  pins the target.
                </p>
              </div>
              <div class="field">
                <label for="pg-system">
                  System prompt <span class="dim">(optional)</span>
                </label>
                <input id="pg-system" name="system" type="text" placeholder="You are a helpful assistant." />
              </div>
            </div>

            <div class="field">
              <label for="pg-prompt">Prompt</label>
              <textarea id="pg-prompt" name="prompt" rows={6} placeholder="Ask anything..." required />
            </div>

            <div class="pg-actions">
              <button class="btn btn-primary" type="submit" id="pg-submit">
                Send
              </button>
              <button class="btn btn-quiet" type="button" id="pg-clear">
                Clear
              </button>
              <span class="pg-status" id="pg-status" aria-live="polite" />
            </div>
          </form>
        </div>
      </Section>

      <Section title="Response" aside="from /v1/chat/completions">
        <div class="card pg-response-card">
          <div class="pg-meta" id="pg-meta" hidden>
            <span class="mark ok" id="pg-meta-model" />
            <span class="mark plain" id="pg-meta-provider" />
            <span class="num" id="pg-meta-latency" />
            <span class="num" id="pg-meta-tokens" />
            <span class="mark" id="pg-meta-fallbacks" hidden />
          </div>
          <pre class="pg-output" id="pg-output" aria-live="polite">
            <span class="pg-placeholder">Response will appear here.</span>
          </pre>
          <pre class="pg-error" id="pg-error" hidden />
        </div>
      </Section>
    </div>
  );
};