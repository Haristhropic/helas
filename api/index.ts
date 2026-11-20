/**
 * Vercel entry point. Every path is rewritten here by vercel.json; `/public` is
 * served by the platform first, so the rewrite never sees a static asset.
 *
 * `maxDuration` is 300 because a streamed completion can legitimately run long —
 * that is the Hobby ceiling, and a router that cuts a stream at 10s is a router
 * nobody uses.
 */
import { handle } from 'hono/vercel';
import app from '../src/app.tsx';

export const config = {
  runtime: 'nodejs',
  maxDuration: 300,
};

export default handle(app);
