// HQ: the Worker answers /api/* and /auth/*; everything else is the app in public/.

import { handleAuth, currentUser, config } from './auth.js';
import { getData, sync, Refused } from './data.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/auth/')) return await handleAuth(req, env, url);
      if (url.pathname.startsWith('/api/')) {
        // Every change carries this header; a page on another site can't add it without a CORS preflight we never allow.
        if (req.method !== 'GET' && req.headers.get('X-HQ') !== '1') return json({ error: 'Bad request' }, 400);
        const me = await currentUser(req, env);
        if (url.pathname === '/api/me') return me ? json({ me, config: config(env, url) }) : json({ config: config(env, url) }, 401);
        if (!me) return json({ error: 'You’re signed out.' }, 401);
        if (url.pathname === '/api/data' && req.method === 'GET') return json({ ...(await getData(env, me)), me });
        if (url.pathname === '/api/sync' && req.method === 'POST') {
          const text = await req.text();
          if (text.length > 2_000_000) return json({ error: 'Too much at once' }, 413);
          const body = JSON.parse(text);
          return json({ ok: true, saved: await sync(env, me, body.changes) });
        }
        return json({ error: 'Not found' }, 404);
      }
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof Refused) return json({ error: e.message, at: e.at }, e.status);
      if (e instanceof SyntaxError) return json({ error: 'Bad request' }, 400);
      console.error(e);
      return json({ error: 'Something went wrong on our side. Try again.' }, 500);
    }
  },
};
