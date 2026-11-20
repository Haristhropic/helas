# Free-tier router

One OpenAI-compatible endpoint in front of eleven free-tier model providers. Point any
OpenAI client at it, ask for `auto`, and the router walks a chain of providers until one
answers. When a provider hits its daily cap, the next hop takes over — that is what makes
a pile of small free allowances feel like one large one.

Built as a Hono app on Vercel with Neon Postgres. The console is server-rendered HTML,
one small stylesheet, one small script, no client framework.

```
npm install
npm run dev          # http://localhost:4319
```

`PORT` lives in `.env` because port 3000 is taken on this machine. Override with
`PORT=5000 npm run dev`.

---

## What you get

| Route | What it is |
| --- | --- |
| `/` | Overview: the fallback chain, today's counters, the last twelve requests |
| `/models` | Model families, which providers serve each, and today's traffic |
| `/providers` | Provider keys, daily limits, the router endpoint and token |
| `/usage` | Per-provider ledger, hourly chart, rate-limit counts |
| `POST /v1/chat/completions` | OpenAI-compatible chat, streaming and not |
| `GET /v1/models` | Aliases plus every `provider/family` pair |
| `GET /healthz` | `{ ok: true, demo: <bool> }` |

Dashboard routes sit behind `DASHBOARD_PASSWORD`; the API sits behind `ROUTER_KEY`.

## Calling it

```bash
curl http://localhost:4319/v1/chat/completions \
  -H "Authorization: Bearer $ROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"hello"}]}'
```

Model names:

- `auto` — the full chain, most headroom first
- `fast`, `smart`, `vision` — shorter chains tuned for one job
- `gpt-oss-120b`, `glm-5.3`, … — a family; the router fans out across every provider
  that serves it
- `groq/llama-3.3-70b` — pin one provider for one request

Anything OpenAI-shaped works: the OpenAI SDK, Cursor, Continue, LibreChat, `llm`, or a
plain `fetch`.

## Configuration

Copy `.env.example` to `.env`. Nothing is required to look at the console — with no
`DATABASE_URL` it renders the sample dataset in `src/data/demo.ts`.

| Variable | Required | What it does |
| --- | --- | --- |
| `DATABASE_URL` | for real data | Neon pooled connection string |
| `KEY_ENC_MASTER` | once keys exist | 32 random bytes, base64; seals provider keys. **Lose it and stored keys are unrecoverable** |
| `ROUTER_KEY` | yes | Bearer token for `/v1/*` |
| `DASHBOARD_PASSWORD` | before deploy | Console password; empty means no gate |
| `SESSION_SECRET` | before deploy | Signs the console cookie |
| `PORT` | local only | Defaults to 3000 |

Generate the secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # KEY_ENC_MASTER
node -e "console.log('sk-' + require('crypto').randomBytes(24).toString('hex'))" # ROUTER_KEY
```

Provider keys are **not** env vars in normal operation. Add them in `/providers`; they are
sealed with AES-256-GCM (AAD = `providerId:keyVersion`) and stored as base64 in Neon. The
router decrypts one key per request and keeps it in memory for five minutes. Only the last
four characters are ever kept in the clear.

## Going live with a database

```bash
# 1. put a Neon pooled connection string in .env
npm run db:push      # create tables
npm run seed         # providers, documented free-tier limits, alias chains
npm run sync         # pull each provider's model list (needs provider keys in env)
```

`seed` is idempotent. `sync` reads `OPENROUTER_API_KEY`, `NVIDIA_API_KEY`, `HF_TOKEN`,
`CHUTES_API_KEY`, `SAMBANOVA_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`,
`GEMINI_API_KEY`, `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`, `DEEPINFRA_API_KEY`,
`NOVITA_API_KEY`, `MISTRAL_API_KEY`, `ZHIPU_API_KEY`, `MODELSCOPE_API_KEY` — only for this
first seed. After that the Sync button in `/providers` uses the keys in the database.

## Deploying

1. Push the repo, import it in Vercel. `vercel.json` sends every path to `api/index.ts`
   and leaves `/public` to the platform.
2. Add the variables from the table above in Project Settings. `DASHBOARD_PASSWORD` is not
   optional in production.
3. Run the three database commands once against the production `DATABASE_URL`.
4. `maxDuration` is 300s (the Hobby ceiling) because a streamed completion can run long.

## How the fallback actually works

The whole retry loop happens **before the first byte reaches the client**. Once a provider
returns headers, the router owns the response and there is no second chance — so a stream
never silently switches models mid-sentence. Each hop gets 15s to produce headers; a 429,
401, 402 or timeout moves to the next candidate. The attempt list is returned in the error
body when every hop fails, which is the only way to debug a chain.

Quotas are counted per provider per UTC day in Neon, in bucketed rows. A provider at its
ceiling is skipped; one at 80% sorts last.

## What is sample data

Everything on the four console screens comes from `src/data/demo.ts`: 2,853 requests,
19.3M tokens, the hourly shape, the twelve recent requests, the per-provider ledger, and
the key hints. Totals are derived from those rows and asserted at module load, so the
screen cannot disagree with itself — but none of it is your traffic.

`src/data/demo.ts` is the single swap point: replace its exports with rows from
`quota_buckets` and `request_log` and every screen follows. Until that swap, the console is
a working mock-up and `/v1/chat/completions` is a working router.

## Known limits

- Streamed requests record a request count but not tokens: the trailing usage frame is not
  parsed yet. Non-streamed requests record both.
- The chain is only walked in practice against keyless providers until you add keys. It has
  been exercised end to end against Pollinations (`auto` → `gpt-oss-20b`, 0.8s).
- No retry on a mid-stream failure. The failure surfaces to the client instead.
- Deployment to Vercel has not been run yet; the code paths are in place, the platform
  behaviour is unverified.
