// Sign-in. Google is the real way in: only accounts on ALLOWED_DOMAINS (your company's email domain), plus any address in
// ALLOWED_EMAILS. Two helpers for testing: a preview code (only while the PREVIEW_CODE secret is set) and a
// dev login (only with DEV_LOGIN=1 on localhost). The session is an HMAC-signed cookie; the signing key is
// made by the app on first use and kept in the secrets table, so nobody handles it.

const COOKIE = '__Host-hq';
const DAYS = 30;
const enc = new TextEncoder();
const b64url = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const list = (v) => String(v || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const COLORS = ['#4D031A', '#990030', '#171717', '#FA004A', '#959CA6', '#00363B', '#68C6BF', '#F1E8DE', '#FFB2BA'];

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

function cookies(req) {
  return Object.fromEntries((req.headers.get('Cookie') || '').split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
}

async function key(env) {
  let row = await env.DB.prepare("SELECT value FROM secrets WHERE id='session-key'").first();
  if (!row) {
    await env.DB.prepare("INSERT OR IGNORE INTO secrets (id,value) VALUES ('session-key',?)").bind(b64url(crypto.getRandomValues(new Uint8Array(32)))).run();
    row = await env.DB.prepare("SELECT value FROM secrets WHERE id='session-key'").first();
  }
  return crypto.subtle.importKey('raw', enc.encode(row.value), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function currentUser(req, env) {
  const v = cookies(req)[COOKIE];
  if (!v) return null;
  const [body, sig] = v.split('.');
  if (!body || !sig) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await key(env), fromB64url(sig), enc.encode(body)))) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    if (!p.x || p.x < Date.now()) return null;
    const u = await env.DB.prepare('SELECT * FROM people WHERE id=?').bind(p.u).first();
    return u && u.active ? u : null;
  } catch {
    return null;
  }
}

async function sessionCookie(env, id) {
  const body = b64url(enc.encode(JSON.stringify({ u: id, x: Date.now() + DAYS * 86400_000 })));
  const sig = b64url(await crypto.subtle.sign('HMAC', await key(env), enc.encode(body)));
  return `${COOKIE}=${body}.${sig}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${DAYS * 86400}`;
}
const clearCookie = `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;

function allowed(env, email, hd) {
  const domain = email.split('@')[1];
  const domains = list(env.ALLOWED_DOMAINS);
  if (list(env.ALLOWED_EMAILS).includes(email)) return true;
  // For Google, the account must belong to the Workspace (hd), not just use the address.
  return hd === undefined ? domains.includes(domain) : domains.includes(String(hd || '').toLowerCase());
}

// Finds or creates the person and returns their id, or an error message.
async function signIn(env, email, name) {
  const r = await findOrCreate(env, email, name);
  if (r.id) await env.DB.prepare('UPDATE people SET lastLogin=? WHERE id=?').bind(email + '|' + new Date().toISOString(), r.id).run();
  return r;
}

async function findOrCreate(env, email, name) {
  const db = env.DB;
  const admins = list(env.ADMIN_EMAILS);
  email = String(email || '').trim().toLowerCase();
  // A person can sign in with their main address or any of their other ones (shared inboxes). Exact matches only:
  // never a pattern (an "_" would match any letter) and never a name (two people can share one). Someone an admin
  // adds before they sign in needs their address on the Team page first.
  const addrs = (r) => [r.email, ...String(r.alt || '').split(',')].map((x) => String(x || '').trim().toLowerCase()).filter(Boolean);
  const p = (await db.prepare('SELECT * FROM people').all()).results.find((r) => addrs(r).includes(email));
  if (p) {
    if (!p.active) return { error: 'Your access to HQ has been turned off. Ask an admin to turn it back on.' };
    if (admins.includes(email) && p.role !== 'Admin') await db.prepare("UPDATE people SET role='Admin' WHERE id=?").bind(p.id).run();
    return { id: p.id };
  }
  const anyAdmin = await db.prepare("SELECT 1 FROM people WHERE role='Admin' AND active=1 LIMIT 1").first();
  const count = (await db.prepare('SELECT COUNT(*) n FROM people').first()).n;
  const id = 'u_' + b64url(crypto.getRandomValues(new Uint8Array(9)));
  await db.prepare('INSERT INTO people (id,name,email,seat,role,active,color,createdAt) VALUES (?,?,?,?,?,1,?,?)')
    .bind(id, name || email.split('@')[0], email, '', admins.includes(email) || !anyAdmin ? 'Admin' : 'Member', COLORS[count % COLORS.length], new Date().toISOString().slice(0, 10)).run();
  return { id };
}

// --- Google ID tokens (RS256), checked against Google's published keys ---
let jwks = null;
async function googleKeys() {
  if (jwks && Date.now() - jwks.at < 3600_000) return jwks.keys;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new Error('Could not load Google keys');
  jwks = { at: Date.now(), keys: (await r.json()).keys || [] };
  return jwks.keys;
}
async function verifyGoogle(token, audience) {
  try {
    const [h, p, s] = String(token || '').split('.');
    const header = JSON.parse(new TextDecoder().decode(fromB64url(h)));
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(p)));
    if (header.alg !== 'RS256') return null;
    const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const k = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', k, fromB64url(s), enc.encode(`${h}.${p}`)))) return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now - 60) return null;
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) return null;
    if (payload.aud !== audience) return null;
    return payload;
  } catch {
    return null;
  }
}

function timingSafeEqual(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

export function config(env, url) {
  return {
    googleClientId: env.GOOGLE_CLIENT_ID || '',
    preview: !!env.PREVIEW_CODE,
    devLogin: env.DEV_LOGIN === '1' && ['localhost', '127.0.0.1'].includes(url.hostname),
    domains: list(env.ALLOWED_DOMAINS),
    company: env.COMPANY_NAME || '',
    logo: env.LOGO || '',
  };
}

const back = (url, error) => Response.redirect(`${url.origin}/${error ? '?signin_error=' + encodeURIComponent(error) : ''}`, 303);

export async function handleAuth(req, env, url) {
  if (req.method !== 'POST') return json({ error: 'Not found' }, 404);

  // Google redirect mode: Google posts the credential here as a form, with a double-submit CSRF cookie.
  if (url.pathname === '/auth/google') {
    if (!env.GOOGLE_CLIENT_ID) return back(url, 'Google sign-in isn’t set up yet.');
    const form = await req.formData();
    const csrf = cookies(req).g_csrf_token;
    if (!csrf || csrf !== form.get('g_csrf_token')) return back(url, 'That sign-in expired. Please try again.');
    const p = await verifyGoogle(form.get('credential'), env.GOOGLE_CLIENT_ID);
    if (!p || !p.email_verified) return back(url, 'Google couldn’t confirm who you are. Please try again.');
    const email = p.email.toLowerCase();
    if (!allowed(env, email, p.hd ?? null)) return back(url, `${email} can’t use this HQ. Sign in with your @${list(env.ALLOWED_DOMAINS)[0] || 'company'} Google account.`);
    const r = await signIn(env, email, p.given_name || p.name);
    if (r.error) return back(url, r.error);
    return new Response(null, { status: 303, headers: { Location: `${url.origin}/`, 'Set-Cookie': await sessionCookie(env, r.id) } });
  }

  if (url.pathname === '/auth/signout') return json({ ok: true }, 200, { 'Set-Cookie': clearCookie });

  if (req.headers.get('X-HQ') !== '1') return json({ error: 'Bad request' }, 400);
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Type your full work email.' }, 400);

  if (url.pathname === '/auth/preview') {
    if (!env.PREVIEW_CODE) return json({ error: 'Preview sign-in is off.' }, 403);
    if (!timingSafeEqual(body.code || '', env.PREVIEW_CODE)) return json({ error: 'That preview code is wrong.' }, 403);
  } else if (url.pathname === '/auth/dev') {
    if (!config(env, url).devLogin) return json({ error: 'Not found' }, 404);
  } else {
    return json({ error: 'Not found' }, 404);
  }
  if (!allowed(env, email)) return json({ error: `${email} can’t use this HQ.` }, 403);
  const r = await signIn(env, email, email.split('@')[0].replace(/^./, (c) => c.toUpperCase()));
  if (r.error) return json({ error: r.error }, 403);
  return json({ ok: true }, 200, { 'Set-Cookie': await sessionCookie(env, r.id) });
}
