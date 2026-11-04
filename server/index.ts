import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, realpathSync, copyFileSync, cpSync, rmSync, readdirSync, renameSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import * as oidc from 'openid-client';
import { Store, HttpError } from './store.ts';
import { Notes, MAX_NOTE_IMAGE_BYTES } from './notes.ts';
import { acquireLock } from './lock.ts';
import type { Action } from '../src/lib/types.ts';

const issuer = process.env.POCKETID_ISSUER;
const clientId = process.env.POCKETID_CLIENT_ID;
const clientSecret = process.env.POCKETID_CLIENT_SECRET;
const redirectUri = process.env.POCKETID_REDIRECT_URI;
if (!issuer || !clientId || !clientSecret || !redirectUri) {
  throw new Error('Configure POCKETID_ISSUER, POCKETID_CLIENT_ID, POCKETID_CLIENT_SECRET, and POCKETID_REDIRECT_URI.');
}
const oidcConfig = await oidc.discovery(new URL(issuer), clientId, clientSecret);
const dataRoot = resolve(process.env.DATA_DIR || 'data');
const usersRoot = resolve(dataRoot, 'users');
const legacyTodo = resolve(process.env.TODO_FILE || resolve(process.env.TODO_DIR || 'data', 'todo.txt'));
const legacyPaths = {
  todo: legacyTodo,
  done: resolve(process.env.DONE_FILE || resolve(dirname(legacyTodo), 'done.txt')),
  inbox: resolve(process.env.INBOX_FILE || resolve(dirname(legacyTodo), 'inbox.txt'))
};
const legacyNotes = resolve(process.env.NOTES_DIR || resolve(dirname(legacyTodo), 'notes'));
const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 3000);
const dev = process.env.NODE_ENV !== 'production';
const secureCookie = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : !dev;
const sessionCookieAttributes = `Path=/; HttpOnly; SameSite=Lax${secureCookie ? '; Secure' : ''}`;
const allowedEmails = new Set((process.env.POCKETID_ALLOWED_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
const sessions = new Map<string, { sub: string; name: string; email: string; expires: number }>();
const logins = new Map<string, { verifier: string; nonce: string; expires: number }>();
type Workspace = { store: Store; notes: Notes; paths: Record<'todo'|'done'|'inbox', string> };
const workspaces = new Map<string, Promise<Workspace>>();

function sessionId(req: import('node:http').IncomingMessage) {
  const raw = req.headers.cookie || '';
  return raw.split(';').map(part => part.trim()).find(part => part.startsWith('tuxedo.session='))?.slice('tuxedo.session='.length) || '';
}
function currentSession(req: import('node:http').IncomingMessage) {
  const id = sessionId(req), session = sessions.get(id);
  if (session && session.expires > Date.now()) return { id, session };
  if (id) sessions.delete(id);
  return null;
}
function redirect(res: import('node:http').ServerResponse, to: string, headers: Record<string,string|string[]> = {}) {
  res.writeHead(302, { Location: to, 'Cache-Control': 'no-store', ...headers }); res.end();
}
function userDirectory(sub: string) { return resolve(usersRoot, createHash('sha256').update(sub).digest('hex')); }
async function workspace(sub: string): Promise<Workspace> {
  const root = userDirectory(sub);
  const previous = workspaces.get(root);
  if (previous) return previous;
  const pending = (async () => {
    mkdirSync(usersRoot, { recursive: true });
    // The first Pocket ID user receives a copy of the existing single-user workspace.
    if (!existsSync(root) && readdirSync(usersRoot).length === 0) {
      const stage = resolve(dataRoot, '.migration-' + randomBytes(5).toString('hex'));
      mkdirSync(stage, { recursive: true });
      try {
        for (const [key, source] of Object.entries(legacyPaths)) {
          if (existsSync(source)) copyFileSync(source, resolve(stage, key + '.txt'));
        }
        if (existsSync(legacyNotes)) cpSync(legacyNotes, resolve(stage, 'notes'), { recursive: true, errorOnExist: true });
        // If no old workspace exists, creating the directory still claims first-user migration.
        renameSync(stage, root);
      } catch (error) { rmSync(stage, { recursive: true, force: true }); throw error; }
    }
    mkdirSync(root, { recursive: true });
    const paths = { todo: resolve(root, 'todo.txt'), done: resolve(root, 'done.txt'), inbox: resolve(root, 'inbox.txt') };
    const release = await acquireLock(paths.todo);
    try {
      const store = new Store(paths);
      if (new Set(Object.values(paths).map(path => realpathSync(path))).size !== 3) throw new Error('Task paths must refer to distinct files.');
      const notes = new Notes(resolve(root, 'notes'));
      process.once('SIGINT', () => { void release(); process.exit(0); });
      process.once('SIGTERM', () => { void release(); process.exit(0); });
      return { store, notes, paths };
    } catch (error) { await release(); throw error; }
  })();
  workspaces.set(root, pending);
  try { return await pending; } catch (error) { workspaces.delete(root); throw error; }
}

const vite = dev ? await (await import('vite')).createServer({ server: { middlewareMode: true, fs: { deny: ['**/.env','**/.env.*','**/*.{crt,pem,key}','**/.git/**','**/*.txt','**/*.md','**/*.transaction.json','**/*.web.lock',usersRoot+'/**'] } }, appType: 'spa' }) : null;
const server = createServer(async (req,res) => {
  const send = (status: number, body: unknown) => { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(body)); };
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    if (url.pathname === '/auth/login' && req.method === 'GET') {
      const verifier = oidc.randomPKCECodeVerifier(), challenge = await oidc.calculatePKCECodeChallenge(verifier);
      const state = oidc.randomState(), nonce = oidc.randomNonce();
      for (const [key, value] of logins) if (value.expires < Date.now()) logins.delete(key);
      logins.set(state, { verifier, nonce, expires: Date.now() + 5 * 60_000 });
      const target = oidc.buildAuthorizationUrl(oidcConfig, { redirect_uri: redirectUri, scope: 'openid profile email', code_challenge: challenge, code_challenge_method: 'S256', state, nonce });
      return redirect(res, target.href, { 'Set-Cookie': `tuxedo.login=${state}; Path=/auth/callback; HttpOnly; SameSite=Lax${secureCookie ? '; Secure' : ''}` });
    }
    if (url.pathname === '/auth/callback' && req.method === 'GET') {
      const state = url.searchParams.get('state') || '';
      const attempt = logins.get(state); logins.delete(state);
      const loginCookie = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('tuxedo.login='))?.slice('tuxedo.login='.length);
      if (!attempt || attempt.expires < Date.now() || loginCookie !== state) throw new HttpError(401, 'Login expired. Please try again.');
      const callbackUrl = new URL(redirectUri); callbackUrl.search = url.search;
      const tokens = await oidc.authorizationCodeGrant(oidcConfig, callbackUrl, { pkceCodeVerifier: attempt.verifier, expectedState: state, expectedNonce: attempt.nonce });
      const claims = tokens.claims();
      const sub = claims?.sub, email = typeof claims?.email === 'string' ? claims.email : '';
      if (!sub) throw new HttpError(401, 'Pocket ID did not return a user identifier.');
      if (allowedEmails.size && (!email || !allowedEmails.has(email.toLowerCase()))) throw new HttpError(403, 'This Pocket ID account is not allowed to use Haken.');
      const id = randomBytes(32).toString('base64url');
      for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key);
      sessions.set(id, { sub, name: typeof claims?.name === 'string' ? claims.name : email || 'User', email, expires: Date.now() + 7 * 24 * 60 * 60_000 });
      return redirect(res, '/', { 'Set-Cookie': [`tuxedo.login=; Path=/auth/callback; Max-Age=0; HttpOnly; SameSite=Lax${secureCookie ? '; Secure' : ''}`, `tuxedo.session=${id}; ${sessionCookieAttributes}; Max-Age=${7 * 24 * 60 * 60}; Expires=${new Date(Date.now()+7*24*60*60_000).toUTCString()}`] });
    }
    if (url.pathname === '/auth/logout') {
      const id = sessionId(req); sessions.delete(id);
      return redirect(res, '/', { 'Set-Cookie': `tuxedo.session=; ${sessionCookieAttributes}; Max-Age=0` });
    }
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'GET' && url.pathname === '/api/session') {
        const current = currentSession(req);
        if (!current) return send(200, { authenticated: false });
        return send(200, { authenticated: true, user: { name: current.session.name, email: current.session.email } });
      }
      const current = currentSession(req);
      if (!current) throw new HttpError(401, 'Sign in with Pocket ID to continue.');
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new HttpError(403, 'Cross-origin requests are not allowed.');
      const { store, notes } = await workspace(current.session.sub);
      if (req.method === 'GET' && url.pathname === '/api/state') return send(200,store.snapshot());
      if (req.method === 'GET' && url.pathname === '/api/note') return send(200,notes.read(url.searchParams.get('path') || ''));
      if (req.method === 'GET' && url.pathname === '/api/note-image') {
        const image=notes.readImage(url.searchParams.get('path') || '');
        res.writeHead(200,{'Content-Type':image.type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});
        res.end(image.data); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/note-image') {
        const chunks:Buffer[]=[];let size=0;
        for await (const chunk of req) { const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=part.length;if(size>MAX_NOTE_IMAGE_BYTES)throw new HttpError(413,'Images must be 12 MB or smaller.');chunks.push(part); }
        const contentType=req.headers['content-type'];
        return send(201,notes.saveImage(Buffer.concat(chunks),Array.isArray(contentType)?contentType[0]:contentType || ''));
      }
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415,'Expected JSON.');
        let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body)>600000) throw new HttpError(413,'Request is too large.'); }
        let data: Record<string,unknown>; try { data = JSON.parse(body); } catch { throw new HttpError(400,'Invalid JSON.'); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400,'Expected a JSON object.');
        if (url.pathname === '/api/action') {
          if (typeof data.revision !== 'string' || !data.action || typeof data.action !== 'object') throw new HttpError(400,'Missing action or file revision.');
          const a = data.action as Action;
          if (a.ids !== undefined && (!Array.isArray(a.ids) || a.ids.length>10000)) throw new HttpError(400,'Invalid selection.');
          return send(200,store.apply(data.revision,a));
        }
        if (url.pathname === '/api/note') return send(200,notes.save(data.path as string,data.text as string,data.revision as string));
      }
      throw new HttpError(404,'Unknown API route.');
    }
    if (vite) { vite.middlewares(req,res); return; }
    const requested = resolve('dist','.'+decodeURIComponent(url.pathname));
    const root = resolve('dist');
    if (!requested.startsWith(root+'/') && requested !== root) throw new HttpError(403,'Invalid path.');
    const file = existsSync(requested) && extname(requested) ? requested : resolve(root,'index.html');
    const mime: Record<string,string> = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
    res.writeHead(200,{'Content-Type':mime[extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}); res.end(readFileSync(file));
  } catch (error) { const e = error instanceof Error ? error : new Error('Unknown error'); send(error instanceof HttpError ? error.status : 500,e.message ? {error:e.message} : {error:'Request failed.'}); }
});
server.listen(port,host,()=>{ console.log(`Haken: http://${host}:${port}\nPocket ID: ${issuer}\nData directory: ${dataRoot}\nMobile capture: /capture`); });
