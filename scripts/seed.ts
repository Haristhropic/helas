/**
 * First seed: providers, their documented free-tier limits, and the alias chains.
 *
 *   npx tsx scripts/seed.ts
 *
 * Idempotent — every write is an upsert or a no-op on conflict, so running it
 * twice does not double a limit. It does NOT touch keys: those are added through
 * the console so they are sealed by the same code path that reads them.
 */
import { db, schema } from '../src/db/client.ts';
import { env } from '../src/env.ts';
import { PROVIDERS } from '../src/providers/catalog.ts';

try {
  process.loadEnvFile('.env');
} catch {
  /* no .env */
}

const ALIASES: Array<{ name: string; chain: string[]; note: string }> = [
  {
    name: 'auto',
    chain: [
      'nvidia/gpt-oss-120b',
      'sambanova/gpt-oss-120b',
      'cerebras/gpt-oss-120b',
      'groq/llama-3.3-70b',
      'cloudflare/gpt-oss-120b',
      'openrouter/gemma-4-31b-it',
      'huggingface/glm-5.3',
      'pollinations/openai-fast',
    ],
    note: 'Most remaining headroom first; a provider with no cap sorts above one with a small cap.',
  },
  {
    name: 'fast',
    chain: ['groq/llama-3.3-70b', 'cerebras/gpt-oss-120b', 'nvidia/gemma-4-31b-it'],
    note: 'Lowest time-to-first-token of the set.',
  },
  {
    name: 'smart',
    chain: ['nvidia/glm-5.3', 'chutes/kimi-k3.1-pro', 'huggingface/qwen3.8-27b'],
    note: 'The three largest-context families that are free on more than one provider.',
  },
  {
    name: 'vision',
    chain: ['nvidia/gemma-4-31b-it', 'gemini/gemini-3.5-flash-lite'],
    note: 'Add zhipu/glm-4.6v-flash once a Z.ai key exists.',
  },
];

async function main() {
  if (env.isDemo) {
    console.error('DATABASE_URL is empty. Nothing to seed.');
    process.exit(1);
  }

  for (const provider of PROVIDERS) {
    await db()
      .insert(schema.providers)
      .values({
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        adapter: provider.adapter,
        note: provider.note,
      })
      .onConflictDoUpdate({
        target: schema.providers.id,
        set: {
          name: provider.name,
          baseUrl: provider.baseUrl,
          adapter: provider.adapter,
          note: provider.note,
        },
      });

    if (provider.freeRequestsPerDay) {
      await db()
        .insert(schema.quotaLimits)
        .values({
          providerId: provider.id,
          modelId: '',
          bucketKind: 'day',
          maxRequests: provider.freeRequestsPerDay,
        })
        .onConflictDoUpdate({
          target: [schema.quotaLimits.providerId, schema.quotaLimits.modelId, schema.quotaLimits.bucketKind],
          set: { maxRequests: provider.freeRequestsPerDay },
        });
    }
  }
  console.log(`${PROVIDERS.length} providers seeded`);

  for (const alias of ALIASES) {
    await db()
      .insert(schema.aliases)
      .values({ name: alias.name, strategy: 'chain', chain: alias.chain, note: alias.note })
      .onConflictDoUpdate({
        target: schema.aliases.name,
        set: { chain: alias.chain, note: alias.note },
      });
  }
  console.log(`${ALIASES.length} aliases seeded`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
