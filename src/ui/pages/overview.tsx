import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';
import { burn, compact, providerName, thousands, utcStamp } from '../../data/demo.ts';
import type { DashboardData } from '../../data/index.ts';
import { Chart, Mark, Section, relTime, statusOf } from '../components.tsx';

export type OverviewMetric = 'requests' | 'tokens';

const COPY_ICON =
  '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6a3 3 0 0 0-3 3v6.5A2.5 2.5 0 0 0 5.5 15"/>';

/** Segment labels are two words at most — the full order is spelled out below the lane. */
const LANE_LABEL: Record<string, string> = {
  nvidia: 'nvidia',
  sambanova: 'samba',
  cerebras: 'cerebras',
  groq: 'groq',
  cloudflare: 'cf',
  openrouter: 'or',
  huggingface: 'hf',
  pollinations: 'poll',
};

export const Overview: FC<{ data: DashboardData; metric: OverviewMetric }> = ({ data, metric }) => {
  const isTokens = metric === 'tokens';
  const values = isTokens ? data.hourlyTokens : data.hourly;
  const total = isTokens ? data.tokensToday : data.requestsToday;
  const peak = Math.max(...values);
  const usedShare = data.capacityToday > 0 ? data.requestsToday / data.capacityToday : 0;

  return (
    <div class="stack">
      <div class="page-head">
        <div>
          <h1>Free-tier router</h1>
          <p class="sub">
            One OpenAI-compatible endpoint in front of {data.providersLive} free providers.{' '}
            {thousands(data.requestsToday)} requests served today out of{' '}
            {thousands(data.capacityToday)} available.
          </p>
        </div>
        <div class="head-actions">
          <span class={data.live ? 'stamp' : 'stamp demo'}>{utcStamp()}{data.live ? '' : ' · demo data'}</span>
        </div>
      </div>

      {/* ── the fallback chain: the one element on this screen only this product has ── */}
      <Section title="Auto chain" aside={'what model: "auto" tries, in order'} action={{ href: '/providers', label: 'Edit order' }}>
        <div class="card">
          <div class="lane" role="list" aria-label="Fallback chain, segments sized by remaining quota today">
            {data.chain.map((node) => {
              const share = data.chainTotal > 0 ? node.left / data.chainTotal : 0;
              const wide = share >= 0.05;
              return (
                <div
                  class={`lane-seg ${node.state}${wide ? ' wide' : ''}`}
                  role="listitem"
                  data-name={LANE_LABEL[node.provider] ?? node.provider}
                  style={`--grow: ${Math.max(node.left, 1)}; --share: ${share.toFixed(4)}`}
                  title={`${providerName(node.provider)} · ${node.family} · ${thousands(node.left)} left today`}
                >
                  {wide ? (
                    <>
                      <span class="seg-name">{LANE_LABEL[node.provider] ?? node.provider}</span>
                      <span class="seg-left">{thousands(node.left)}</span>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div class="lane-meta">
            <span class="lead">{thousands(data.chainTotal)} requests left across {data.chain.length} hops</span>
            <span>
              {data.chain.length > 0
                ? <>next up: {data.chain[0].provider}/{data.chain[0].family} · {thousands(data.chain[0].left)} left</>
                : 'no chain configured'}
            </span>
          </div>

          <p class="lane-order">
            {data.chain.map((node, i) => (
              <>
                {i > 0 ? <span class="arrow"> → </span> : null}
                <span class={node.state === 'exhausted' ? 'out' : undefined}>{node.provider}</span>
              </>
            ))}
          </p>

          <div class="lane-legend">
            <span>
              <i class="swatch s-live" /> has headroom
            </span>
            <span>
              <i class="swatch s-cooling" /> under 20 left
            </span>
            <span>
              <i class="swatch s-exhausted" /> exhausted today
            </span>
          </div>
        </div>
      </Section>

      {/* ── usage tray: KPI strip and the chart it selects, in one #fafafa field ── */}
      <Section title="Today" aside="counters reset at 00:00 UTC" action={{ href: '/usage', label: 'Full breakdown' }}>
        <div class="tray">
          <div class="kpi-strip">
            <a class="kpi" href="/?m=requests" aria-current={!isTokens ? 'true' : undefined}>
              <span class="kpi-label">Requests served</span>
              <span class="kpi-value">{thousands(data.requestsToday)}</span>
              <span class="kpi-note">of {thousands(data.capacityToday)} available</span>
            </a>
            <a class="kpi" href="/?m=tokens" aria-current={isTokens ? 'true' : undefined}>
              <span class="kpi-label">Tokens</span>
              <span class="kpi-value">{compact(data.tokensToday)}</span>
              <span class="kpi-note">across {data.providersLive} providers</span>
            </a>
            <div class="kpi">
              <span class="kpi-label">Capacity used</span>
              <span class="kpi-value">
                {(usedShare * 100).toFixed(1)}
                <span class="unit">%</span>
              </span>
              <span class="kpi-note">of the daily free allowance</span>
            </div>
            <div class="kpi">
              <span class="kpi-label">Chain remaining</span>
              <span class="kpi-value">{thousands(data.chainTotal)}</span>
              <span class="kpi-note">{data.chainLive} of {data.chain.length} hops live</span>
            </div>
            <div class="kpi">
              <span class="kpi-label">p95 latency</span>
              <span class="kpi-value">
                {thousands(data.weightedP95)}
                <span class="unit">ms</span>
              </span>
              <span class="kpi-note">weighted by requests</span>
            </div>
          </div>

          <div class="tray-row">
            <div class="card">
              <div class="chart-note">
                <span class="what">{isTokens ? 'Tokens by hour' : 'Requests by hour'}</span>
                <span class="total">
                  {isTokens ? compact(total) : thousands(total)} · UTC today
                </span>
              </div>
              <Chart
                config={{
                  kind: 'bars',
                  labels: data.hourLabels,
                  values,
                  highlight: data.currentHour,
                  format: isTokens ? 'compact' : 'int',
                  height: 224,
                  colour: 'var(--chart-3)',
                }}
              />
              <div class="chart-foot">
                <span>
                  The blue bar is the hour in progress. Nothing after {data.hourLabels[data.currentHour]} has
                  happened yet.
                </span>
                <span>peak {isTokens ? compact(peak) : thousands(peak)}/h</span>
              </div>
            </div>

            <div class="card">
              <div class="chart-note">
                <span class="what">Closest to the cap</span>
                <span class="total">{data.nearCap.length} of {data.providersLive}</span>
              </div>
              <div class="rank">
                {data.nearCap.map((p) => {
                  const pct = burn(p);
                  const tone = pct >= 0.95 ? ' is-hot' : pct > 0.8 ? ' is-warm' : '';
                  return (
                    <div class="rank-row">
                      <div class="rank-name">
                        <span class="n">{p.name}</span>
                        <div class={`rank-bar${tone}`} role="img" aria-label={`${(pct * 100).toFixed(0)} percent of the daily ceiling used`}>
                          <i style={`width: ${(pct * 100).toFixed(1)}%`} />
                        </div>
                      </div>
                      <div class="rank-val">
                        <span class="v">{thousands(p.used)}</span>
                        <span class="u">of {thousands(p.limit)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── recent requests ── */}
      <Section title="Recent requests" aside={data.live ? 'last requests this UTC day' : 'last 12 minutes'} action={{ href: '/usage', label: 'See all' }}>
        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Model</th>
                <th>Provider</th>
                <th class="r">Status</th>
                <th class="r">Latency</th>
                <th class="r">Tokens</th>
                <th class="r">Fallbacks</th>
              </tr>
            </thead>
            <tbody>
              {data.requests.length === 0 ? (
                <tr>
                  <td colspan={7} class="empty">
                    No requests today yet{data.live ? '' : ' (sample data)'}.
                  </td>
                </tr>
              ) : (
                data.requests.map((r) => (
                  <tr>
                    <td class="id">
                      <span>{r.id.slice(0, 8)}…</span>
                      <button class="copy" type="button" data-copy={r.id} aria-label={`Copy request id ${r.id}`} title="Copy full id">
                        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                          {raw(COPY_ICON)}
                        </svg>
                      </button>
                      <span class="dim ago">{relTime(r.minutesAgo)}</span>
                    </td>
                    <td class="model">{r.family}</td>
                    <td class="dim">{providerName(r.provider)}</td>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <p class="footnote">
        {data.live
          ? 'Live from Neon. Keys are sealed with AES-256-GCM before they are written; the router walks the chain until one provider answers with headers, which is the last moment a fallback is still possible.'
          : 'Demo dataset — set DATABASE_URL to render live traffic.'}
      </p>
    </div>
  );
};
