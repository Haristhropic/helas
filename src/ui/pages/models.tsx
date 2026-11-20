import type { FC } from 'hono/jsx';
import {
  MODEL_ENDPOINTS,
  MODEL_FAMILIES,
  MODEL_LONGEST,
  MODEL_ROWS,
  MODEL_SERVED,
  REQUESTS_TODAY,
  providerName,
  thousands,
  type ModelRow,
} from '../../data/demo.ts';
import { contextLabel } from '../components.tsx';

export type ModelFilter = 'all' | 'tools' | 'vision' | 'long';

const TABS: Array<{ id: ModelFilter; label: string }> = [
  { id: 'all', label: 'All families' },
  { id: 'tools', label: 'Tool calling' },
  { id: 'vision', label: 'Vision' },
  { id: 'long', label: '200K+ context' },
];

function keep(row: ModelRow, filter: ModelFilter): boolean {
  if (filter === 'tools') return row.tools;
  if (filter === 'vision') return row.vision;
  if (filter === 'long') return row.contextK >= 200;
  return true;
}

const byServed = (a: ModelRow, b: ModelRow) => b.served - a.served;

export const Models: FC<{ filter: ModelFilter }> = ({ filter }) => {
  const rows = MODEL_ROWS.filter((r) => keep(r, filter)).sort(byServed);
  const served = rows.reduce((a, r) => a + r.served, 0);
  const endpoints = rows.reduce((a, r) => a + r.providers.length, 0);
  const remainder = REQUESTS_TODAY - MODEL_SERVED;

  return (
    <div class="stack">
      <div class="page-head">
        <div>
          <h1>Models</h1>
          <p class="sub">
            {MODEL_FAMILIES} families across {MODEL_ENDPOINTS} free endpoints. Ask for a bare family
            name and the router fans out across every provider that serves it, most headroom first.
          </p>
        </div>
        <div class="head-actions">
          <span class="stamp">longest context {MODEL_LONGEST.toLocaleString('en-US')}K</span>
        </div>
      </div>

      <div>
        <div class="tabs">
          {TABS.map((tab) => (
            <a href={tab.id === 'all' ? '/models' : `/models?f=${tab.id}`} aria-current={filter === tab.id ? 'page' : undefined}>
              {tab.label}
            </a>
          ))}
          <span class="count" data-count-wrap>
            <strong data-count>{rows.length}</strong> of {MODEL_FAMILIES} families
          </span>
        </div>

        <div class="toolbar">
          <input
            class="search"
            type="search"
            placeholder="Filter by family or provider"
            aria-label="Filter families by name or provider"
            data-filter
          />
          <span class="spacer" />
          <span class="count">
            {thousands(served)} requests today · {endpoints} endpoints
          </span>
        </div>

        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>Family</th>
                <th>Served by</th>
                <th class="r">Context</th>
                <th class="r">Tools</th>
                <th class="r">Vision</th>
                <th class="r">Served today</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const names = row.providers.slice(0, 3).map(providerName);
                const more = row.providers.length - names.length;
                return (
                  <tr data-search={`${row.family} ${row.providers.join(' ')}`.toLowerCase()}>
                    <td class="model">{row.family}</td>
                    <td class="dim served-by">
                      {names.join(', ')}
                      {more > 0 ? ` +${more}` : ''}
                    </td>
                    <td class="r num">{contextLabel(row.contextK)}</td>
                    <td class="r">{row.tools ? 'Yes' : <span class="zero">–</span>}</td>
                    <td class="r">{row.vision ? 'Yes' : <span class="zero">–</span>}</td>
                    <td class="r num">{thousands(row.served)}</td>
                  </tr>
                );
              })}
              <tr class="no-match" hidden>
                <td colspan={6} class="empty">
                  No family matches that.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="footnote">
          {thousands(remainder)} of today's {thousands(REQUESTS_TODAY)} requests went to families
          below this list.
        </p>
      </div>

      <section>
        <div class="section-head">
          <h2>
            Ask for one
            <span class="aside">any OpenAI client works; the model name is the only variable</span>
          </h2>
        </div>
        <div class="card">
          <pre class="code">
            <code>{`curl "$ROUTER_URL/v1/chat/completions" \\
  -H "authorization: Bearer $ROUTER_KEY" \\
  -H "content-type: application/json" \\
  -d '{"model":"gpt-oss-120b","stream":true,
       "messages":[{"role":"user","content":"hi"}]}'`}</code>
          </pre>
          <p class="code-note">
            <span class="mono">auto</span>, <span class="mono">fast</span>,{' '}
            <span class="mono">smart</span> and <span class="mono">vision</span> are aliases: each one
            is an ordered chain, not a single model. Prefix a provider to pin the request —{' '}
            <span class="mono">nvidia/glm-5.3</span> skips the chain entirely.
          </p>
        </div>
      </section>
    </div>
  );
};
