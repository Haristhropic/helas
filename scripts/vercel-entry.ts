import { handle } from 'hono/vercel';
import app from '../src/app.tsx';

export const config = { runtime: 'nodejs', maxDuration: 300 };
export const handler = handle(app);
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS, handler as HEAD };