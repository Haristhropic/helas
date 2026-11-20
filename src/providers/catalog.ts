/**
 * The provider catalog.
 *
 * Every entry here was reachable at the time of writing. `freeRequestsPerDay` is
 * the documented free-tier ceiling where one exists; it is a *default seed* for
 * `quota_limits`, not a guarantee. Free tiers move — the sync script and the
 * health table are what keep this honest, not this file.
 *
 * `keyless: true` means the endpoint accepts requests without an API key. There
 * is exactly one of those left worth using.
 */

export type AdapterKind = 'openai' | 'cloudflare';

export interface ProviderDef {
  id: string;
  name: string;
  baseUrl: string;
  adapter: AdapterKind;
  keyless?: boolean;
  /** Documented free-tier daily request ceiling, if published. */
  freeRequestsPerDay?: number;
  /** Documented free-tier per-minute ceiling, if published. */
  freeRequestsPerMinute?: number;
  note: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    adapter: 'openai',
    freeRequestsPerDay: 50,
    freeRequestsPerMinute: 20,
    note: 'Only `:free` variants count against the free cap. Buying ≥10 credits once raises it to 1000/day.',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    adapter: 'openai',
    freeRequestsPerDay: 1000,
    freeRequestsPerMinute: 40,
    note: 'Catalog is public without a key; inference needs one. Dev credits, then paid.',
  },
  {
    id: 'huggingface',
    name: 'HuggingFace Router',
    baseUrl: 'https://router.huggingface.co/v1',
    adapter: 'openai',
    freeRequestsPerDay: 300,
    note: 'Monthly credit allowance rather than a hard daily cap. 162 public models.',
  },
  {
    id: 'chutes',
    name: 'Chutes',
    baseUrl: 'https://llm.chutes.ai/v1',
    adapter: 'openai',
    freeRequestsPerDay: 200,
    note: '19 public models, mostly TEE-hosted open weights.',
  },
  {
    id: 'sambanova',
    name: 'SambaNova',
    baseUrl: 'https://api.sambanova.ai/v1',
    adapter: 'openai',
    freeRequestsPerDay: 200,
    note: 'Small catalog, five models. Fast on the ones it serves.',
  },
  {
    id: 'pollinations',
    name: 'Pollinations',
    baseUrl: 'https://text.pollinations.ai/openai',
    adapter: 'openai',
    keyless: true,
    freeRequestsPerDay: 200,
    note: 'The only keyless endpoint left. One anonymous model: openai-fast (GPT-OSS 20B).',
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    adapter: 'openai',
    freeRequestsPerDay: 1000,
    freeRequestsPerMinute: 30,
    note: 'Per-model caps, not per-account. Lowest time-to-first-token of the set.',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    adapter: 'openai',
    freeRequestsPerMinute: 30,
    freeRequestsPerDay: 900,
    note: 'Wafer-scale inference. Free tier is generous on tokens per day.',
  },
  {
    id: 'gemini',
    name: 'Google AI Studio',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    adapter: 'openai',
    freeRequestsPerMinute: 15,
    freeRequestsPerDay: 1500,
    note: 'Limits are per Google Cloud project; RPD resets at midnight Pacific.',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Workers AI',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1',
    adapter: 'cloudflare',
    freeRequestsPerDay: 300,
    note: '10,000 Neurons/day. Nine frontier models now require a paid method.',
  },
  {
    id: 'deepinfra',
    name: 'DeepInfra',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    adapter: 'openai',
    note: 'Catalog is public. A handful of small models are free; the rest are metered.',
  },
  {
    id: 'novita',
    name: 'Novita',
    baseUrl: 'https://api.novita.ai/v3/openai',
    adapter: 'openai',
    note: 'Catalog is public. One zero-cost model on the free tier.',
  },
  {
    id: 'mistral',
    name: 'Mistral La Plateforme',
    baseUrl: 'https://api.mistral.ai/v1',
    adapter: 'openai',
    note: 'Free "experiment" tier. Two zero-cost models in the labs namespace.',
  },
  {
    id: 'zhipu',
    name: 'Z.ai / Zhipu',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    adapter: 'openai',
    note: 'Flash-tier models are free: glm-4.5-flash, glm-4.6v-flash, glm-4.7-flash.',
  },
  {
    id: 'modelscope',
    name: 'ModelScope',
    baseUrl: 'https://api-inference.modelscope.cn/v1',
    adapter: 'openai',
    note: 'Seven free models, mostly Qwen and GLM variants.',
  },
];

export const PROVIDERS_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export function resolveBaseUrl(def: ProviderDef, accountId?: string): string {
  return def.baseUrl.replace('{account_id}', accountId ?? '');
}
