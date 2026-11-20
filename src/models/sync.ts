/**
 * Catalog sync — one implementation, two callers: the dashboard's Sync button and
 * `npm run sync`. It never touches the request path.
 *
 * The rule: a provider whose key is missing is skipped, not retried. A provider
 * that answers with junk is recorded as a failure and the remaining providers are
 * still synced, because one 500 should not leave the catalog a version behind.
 */
import { PROVIDERS } from '../providers/catalog.ts';
import { listModels } from '../providers/adapters.ts';
import { db } from '../db/client.ts';
import { models, providers } from '../db/schema.ts';
import { env } from '../env.ts';

export type KeyResolver = (providerId: string) => Promise<string | null>;

export interface SyncResult {
  provider: string;
  ok: boolean;
  count?: number;
  error?: string;
}

/** `meta-llama/Llama-3.3-70B-Instruct:free` → `llama-3.3-70b-instruct`. */
function familyOf(upstreamId: string): string {
  return upstreamId.replace(/^.*\//, '').split(':')[0].toLowerCase();
}

export async function syncCatalog(resolveKey: KeyResolver): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  for (const provider of PROVIDERS) {
    let apiKey: string | null = null;
    if (!provider.keyless) {
      apiKey = await resolveKey(provider.id);
      if (!apiKey) {
        results.push({ provider: provider.id, ok: false, error: 'no key' });
        continue;
      }
    }

    try {
      const listed = await listModels(
        provider,
        apiKey,
        process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || undefined,
      );
      if (listed.length === 0) {
        results.push({ provider: provider.id, ok: false, error: 'empty catalog' });
        continue;
      }

      if (!env.isDemo) {
        await db()
          .insert(providers)
          .values({
            id: provider.id,
            name: provider.name,
            baseUrl: provider.baseUrl,
            adapter: provider.adapter,
            note: provider.note,
          })
          .onConflictDoNothing();

        const now = new Date();
        for (const entry of listed) {
          await db()
            .insert(models)
            .values({
              id: `${provider.id}:${entry.id}`,
              providerId: provider.id,
              upstreamId: entry.id,
              family: familyOf(entry.id),
              displayName: entry.id,
              contextLen: entry.contextLength ?? null,
              isFree: true,
              enabled: true,
              lastSyncedAt: now,
            })
            .onConflictDoUpdate({
              target: models.id,
              set: {
                displayName: entry.id,
                contextLen: entry.contextLength ?? null,
                lastSyncedAt: now,
                enabled: true,
              },
            });
        }
      }

      results.push({ provider: provider.id, ok: true, count: listed.length });
    } catch (err) {
      results.push({ provider: provider.id, ok: false, error: (err as Error).message.slice(0, 160) });
    }
  }

  return results;
}

export function summarize(results: SyncResult[]): string {
  const ok = results.filter((r) => r.ok);
  const total = ok.reduce((a, r) => a + (r.count ?? 0), 0);
  const skipped = results.filter((r) => !r.ok && r.error === 'no key').length;
  const failed = results.filter((r) => !r.ok && r.error !== 'no key').length;
  return `${total} endpoints from ${ok.length} providers · ${skipped} without a key · ${failed} failed`;
}
