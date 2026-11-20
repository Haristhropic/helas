/**
 * Pull every provider's model list into the catalog.
 *
 *   npm run sync
 *
 * Keys come from the environment here, not from Neon — this runs before the
 * console has any keys in it. Once the console has keys, the Sync button uses
 * those instead; both go through `syncCatalog`, so they cannot disagree.
 */
import { eq } from 'drizzle-orm';
import { db, schema } from '../src/db/client.ts';
import { env } from '../src/env.ts';
import { syncCatalog, summarize } from '../src/models/sync.ts';

try {
  process.loadEnvFile('.env');
} catch {
  /* no .env */
}

const ENV_KEYS: Record<string, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  nvidia: 'NVIDIA_API_KEY',
  huggingface: 'HF_TOKEN',
  chutes: 'CHUTES_API_KEY',
  sambanova: 'SAMBANOVA_API_KEY',
  groq: 'GROQ_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  gemini: 'GEMINI_API_KEY',
  cloudflare: 'CLOUDFLARE_API_TOKEN',
  deepinfra: 'DEEPINFRA_API_KEY',
  novita: 'NOVITA_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  zhipu: 'ZHIPU_API_KEY',
  modelscope: 'MODELSCOPE_API_KEY',
  tiprouter: 'TIPROUTER_API_KEY',
};

async function resolveKey(providerId: string): Promise<string | null> {
  const fromEnv = process.env[ENV_KEYS[providerId] ?? '']?.trim();
  if (fromEnv) return fromEnv;
  if (env.isDemo) return null;

  const rows = await db()
    .select()
    .from(schema.providerKeys)
    .where(eq(schema.providerKeys.providerId, providerId))
    .limit(1);
  if (rows.length === 0) return null;

  const { openKeyCached } = await import('../src/crypto/keys.ts');
  return openKeyCached({
    id: rows[0].id,
    ciphertext: rows[0].ciphertext,
    iv: rows[0].iv,
    keyVersion: rows[0].keyVersion,
    providerId,
  });
}

async function main() {
  const results = await syncCatalog(resolveKey);
  for (const result of results) {
    const status = result.ok ? `${result.count} endpoints` : result.error;
    console.log(`  ${result.provider.padEnd(14)} ${status}`);
  }
  console.log(`\n${summarize(results)}`);
  if (env.isDemo) console.log('DATABASE_URL is empty: nothing was written.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
