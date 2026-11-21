import type { FC } from 'hono/jsx';
import { burn, compact, thousands } from '../../data/demo.ts';
import type { DashboardData } from '../../data/index.ts';
import { Chart, Mark, SHORT, relTime } from '../components.tsx';

export type UsageMetric = 'requests' | 'tokens' | 'burn';

const METRICS: Array<{ id: UsageMetric; label: string }> = [
  { id: 'requests', label: 'Requests' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'burn', label: 'Share of cap' },
];

export const Usage: FC<{ data: DashboardData; metric: UsageMetric }> = ({ data, metric }) => {
  const ranked = [...data.usage].sort((a, b) => b.used - a.used);
  const top = ranked.slice(0, 8);

  const config =
    metric === 'burn'
      ? {
          kind: 'bars',
          labels: ranked.map((p) => SHORT[p.id] ?? p.id),
          values: ranked.map((p) => Number(burn(p).toFixed(3))),
          format: 'pct0',
          tickFormat: 'pct0',
          height: 268,
          highlight: ranked.map((p, i) => (burn(p) >= 0.8 ? i : -1)).filter((i) => i >= 0),
          colour: 'var(--chart-3)',
        }
      : {
          kind: 'bars',
          labels: data.hourLabels,
          values: metric === 'tokens' ? data.hourlyTokens : data.hourly,
          highlight: data.currentHour,
          format: metric === 'tokens' ? 'compact' : 'int',
          height: 268,
          colour: 'var(--chart-3)',
        };

  const what =
    metric === 'burn'
      ? 'Daily ceiling used, per provider'
      : metric === 'tokens'
        ? 'Tokens by hour'
        : 'Requests by hour';

  const totalLabel =
    metric === 'burn'
      ? `${ranked.filter((p) => burn(p) > 0.8).length} above 80%`
      : metric === 'tokens'
        ? `${compact(data.tokensToday)} / UTC today`
        : `${thousands(data.requestsToday)} / UTC today`;

  return (
    <div class="stack">
      <div class="page-head ruled">
        <div>
          <h1>Usage</h1>
          <p class="sub">
            {data.requestsToday} requests and {compact(data.tokensToday)} tokens spent against{' '}
            {thousands(data.capacityToday)} available requests today.
          </p>
        </div>
        <div class="head-actions">
          <span class="stamp">p95 {thousands(data.weightedP95)} ms</span>
        </div>
      </div>

      <div class="two-up-rev">
        <div class="card">
          <div class="chart-note">
            <span class="what">Where the requests went</span>
            <span class="total">top 8 of {ranked.length}</span>
          </div>
          <div class="ledger">
            {top.map((p) => (
              <div class="ledger-row">
                <span class="name">{p.name}</span>
                <span class="share">{(burn(p) * 100).toFixed(0)}% of cap</span>
                <span class="v num">{thousands(p.used)}</span>
              </div>
            ))}
          </div>
          <p class="footnote tight">
            The remaining {ranked.length - top.length} providers took {thousands(data.requestsToday - top.reduce((a, p) => a + p.used, 0))} requests between them.
          </p>
        </div>

        <div class="card">
          <div class="chart-note">
            <span class="what">{what}</span>
            <span class="total">{totalLabel}</span>
          </div>
          <Chart config={config} />
          <div class="range">
            {METRICS.map((m) => (
              <a
                href={m.id === 'requests' ? '/usage' : `/usage?m=${m.id}`}
                aria-current={metric === m.id ? 'true' : undefined}
              >
                {m.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <section>
        <div class="section-head">
          <h2 class="quiet">By provider</h2>
          <span class="count">
            {data.rateLimitedToday} rate-limited calls today
          </span>
        </div>
        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th class="r">Keys</th>
                <th class="r">Requests</th>
                <th class="r">Tokens</th>
                <th class="r">Of cap</th>
                <th class="r">Rate-limited</th>
                <th class="r">p95</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((p) => (
                <tr>
                  <td class="model">{p.name}</td>
                  <td class="r num">{p.keys === 0 ? <span class="zero">keyless</span> : p.keys}</td>
                  <td class="r num">{thousands(p.used)}</td>
                  <td class="r num">{compact(p.tokens)}</td>
                  <td class="r num">{(burn(p) * 100).toFixed(1)}%</td>
                  <td class="r num">
                    {p.rateLimited === 0 ? <span class="zero">0</span> : p.rateLimited}
                  </td>
                  <td class="r num">{thousands(p.p95)} ms</td>
                </tr>
              ))}
              <tr class="total-row">
                <td>All providers</td>
                <td class="r num">{ranked.reduce((a, p) => a + p.keys, 0)}</td>
                <td class="r num">{thousands(data.requestsToday)}</td>
                <td class="r num">{compact(data.tokensToday)}</td>
                <td class="r num">{((data.requestsToday / data.capacityToday) * 100).toFixed(1)}%</td>
                <td class="r num">{data.rateLimitedToday}</td>
                <td class="r num">{thousands(data.weightedP95)} ms</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div class="section-head">
          <h2 class="quiet">Last requests</h2>
        </div>
        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Model</th>
                <th>Provider</th>
                <th class="r">Status</th>
                <th class="r">Latency</th>
                <th class="r">Tokens</th>
                <th class="r">Fallbacks</th>
              </tr>
            </thead>
            <tbody>
              {data.requests.map((r) => (
                <tr>
                  <td class="dim">{relTime(r.minutesAgo)}</td>
                  <td class="model">{r.family}</td>
                  <td class="dim">{r.provider}</td>
                  <td class="r">
                    {r.status === 200 ? (
                      <span class="num">{r.status}</span>
                    ) : (
                      <Mark tone="bad">{r.status}</Mark>
                    )}
                  </td>
                  <td class="r num">{thousands(r.ms)} ms</td>
                  <td class="r num">{thousands(r.tokens)}</td>
                  <td class="r num">
                    {r.fallbacks === 0 ? <span class="zero">0</span> : r.fallbacks}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};