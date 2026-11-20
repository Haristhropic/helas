/**
 * Local development server.
 *
 * Static serving lives here and not in `src/app.tsx` on purpose: `@hono/node-server`
 * is a dev dependency, and importing its static middleware from the app would drag
 * a Node-only package into the Vercel function bundle. On Vercel, `/public` is
 * served by the platform before the rewrite ever runs.
 */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import app from './app.tsx';

// Node 24 reads `.env` natively. Missing file is fine: the demo dataset needs no env.
try {
  process.loadEnvFile('.env');
} catch {
  /* no .env yet */
}

app.use('/*', serveStatic({ root: './public' }));

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`router console  http://localhost:${info.port}`);
  console.log(`openai surface  http://localhost:${info.port}/v1/chat/completions`);
});
