import type { FC, PropsWithChildren } from 'hono/jsx';
import type { ProviderUsage } from '../data/demo.ts';

/**
 * A section is a title on the ground with a quiet action at the far side, and a
 * surface under it. The title never sits inside the card — that is what keeps a
 * page of panels from reading as a stack of widgets.
 */
export const Section: FC<
  PropsWithChildren<{ title: string; aside?: string; action?: { href: string; label: string } }>
> = (props) => (
  <section>
    <div class="section-head">
      <h2>
        {props.title}
        {props.aside ? <span class="aside">{props.aside}</span> : null}
      </h2>
      {props.action ? (
        <a class="action" href={props.action.href}>
          {props.action.label}
        </a>
      ) : null}
    </div>
    {props.children}
  </section>
);

/** A status mark is text in a tinted pill, one per row, only where a row is not fine. */
export const Mark: FC<PropsWithChildren<{ tone: 'ok' | 'warn' | 'bad' | 'neutral' }>> = (props) => (
  <span class={`mark ${props.tone}`}>{props.children}</span>
);

export function statusOf(p: ProviderUsage): { tone: 'ok' | 'warn' | 'bad' | 'neutral'; label: string } {
  if (p.status === 'degraded') return { tone: 'bad', label: 'Degraded' };
  if (p.status === 'warn') return { tone: 'warn', label: 'Near cap' };
  if (p.status === 'off') return { tone: 'neutral', label: 'Idle' };
  return { tone: 'ok', label: 'Serving' };
}

/** A chart element. `app.js` reads the JSON and calls the matching Charts method. */
export const Chart: FC<{ config: Record<string, unknown> }> = ({ config }) => (
  <div class="chart" data-chart={JSON.stringify(config)} />
);

/** 1000 → "1M", 262 → "262K". Context windows only. */
export function contextLabel(k: number): string {
  if (k >= 1000) return `${(k / 1000).toFixed(k % 1000 === 0 ? 0 : 1)}M`;
  return `${k}K`;
}

/** Short name for a provider inside a narrow rail. */
export const SHORT: Record<string, string> = {
  openrouter: 'openrouter',
  nvidia: 'nvidia',
  huggingface: 'hf',
  chutes: 'chutes',
  sambanova: 'sambanova',
  pollinations: 'pollinations',
  groq: 'groq',
  cerebras: 'cerebras',
  gemini: 'gemini',
  cloudflare: 'cloudflare',
  zhipu: 'zhipu',
  deepinfra: 'deepinfra',
  novita: 'novita',
  mistral: 'mistral',
  modelscope: 'modelscope',
};

export function relTime(minutesAgo: number): string {
  if (minutesAgo === 0) return 'just now';
  if (minutesAgo === 1) return '1 min ago';
  return `${minutesAgo} min ago`;
}
