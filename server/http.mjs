import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Auth } from './auth.mjs';
import { Projects } from './projects.mjs';
import { Collaboration } from './collaboration.mjs';
import { checkDatabase } from './database.mjs';
import { HttpError } from './validation.mjs';
import { createLogger, errorCode, requestId } from './logger.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const pages = new Set(['index.html', 'projects.html', 'visual-notes.html', 'tasks.html', 'settings.html']);
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' };
export const maxBodyBytes = 16 * 1024 * 1024;

async function body(req) {
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new HttpError(415, 'Send JSON data.');
    if (Number(req.headers['content-length']) > maxBodyBytes) throw new HttpError(413, 'Project exceeds the 16 MB save limit.');
    let length = 0;
    const chunks = [];
    for await (const chunk of req) {
        length += chunk.length;
        if (length > maxBodyBytes) throw new HttpError(413, 'Project exceeds the 16 MB save limit.');
        chunks.push(chunk);
    }
    try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        return value;
    } catch { throw new HttpError(400, 'Invalid JSON request.'); }
}

export function createApp({ pool, config, provider, onError = () => {}, log = createLogger() }) {
    const auth = new Auth(pool, config, provider);
    const projects = new Projects(pool);
    const collaboration = new Collaboration(auth, projects, log);
    // Limit login work before reaching Google or the database. Bound memory as well.
    const loginAttempts = new Map();
    const cleanup = setInterval(() => {
        loginAttempts.clear();
        auth.cleanup().catch(error => { log('session.cleanup_failed', { status: 500, errorCode: errorCode(error) }); onError(); });
    }, 60000);
    cleanup.unref();

    const server = createServer({ requestTimeout: 30000, headersTimeout: 10000, maxHeaderSize: 16384 }, async (req, res) => {
        const started = performance.now();
        const context = { requestId: requestId(), method: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'].includes(req.method) ? req.method : 'OTHER', route: 'unmatched' };
        req.requestId = context.requestId;
        res.setHeader('X-Request-ID', context.requestId);
        let event = 'request.completed';
        res.once('finish', () => {
            const durationMs = Math.round(performance.now() - started);
            if (event !== 'request.completed' || res.statusCode >= 400 || (durationMs >= 1000 && context.route !== 'projects.live')) {
                log(event, { ...context, status: res.statusCode, durationMs });
            }
        });
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
        const json = (status, value) => {
            res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(value));
        };
        const redirect = (location, cookie) => {
            res.writeHead(303, { Location: location, 'Set-Cookie': cookie });
            res.end();
        };
        try {
            const url = new URL(req.url, config.origin);
            const path = decodeURIComponent(url.pathname);
            const method = req.method;
            if (method === 'GET' && path === '/healthz') return json(200, { status: 'ok' });
            if (method === 'GET' && path === '/readyz') {
                try { await checkDatabase(pool); } catch { throw new HttpError(503, 'Database is not ready.'); }
                return json(200, { status: 'ready' });
            }
            if (method === 'GET' && path.startsWith('/auth/google/')) {
                context.route = 'auth.google';
                const key = req.socket.remoteAddress;
                const attempts = (loginAttempts.get(key) ?? 0) + 1;
                if (attempts > 60 || (loginAttempts.size >= 10000 && !loginAttempts.has(key))) {
                    res.setHeader('Retry-After', '60');
                    throw new HttpError(429, 'Too many sign-in attempts. Try again in a minute.');
                }
                loginAttempts.set(key, attempts);
                if (path === '/auth/google/start') {
                    const flow = await auth.begin(req);
                    return redirect(flow.location, flow.cookie);
                }
                if (path === '/auth/google/callback') return redirect('/projects.html', await auth.finish(req, url.searchParams));
            }
            if (path.startsWith('/api/')) {
                const route = path.match(/^\/api\/projects\/([^/]+)(?:\/(view|members|edits|live|presence)(?:\/([^/]+))?)?$/);
                if (route) {
                    context.route = `projects.${route[2] || 'item'}`;
                    context.projectId = route[1]; context.memberId = route[3];
                } else if (['/api/projects', '/api/session', '/api/logout'].includes(path)) context.route = path.slice(5);
                const session = await auth.session(req);
                context.userId = session?.id;
                if (path === '/api/session' && method === 'GET') return json(200, { user: session });
                if (!session) throw new HttpError(401, 'Sign in to access your projects.');
                if (!['GET', 'HEAD'].includes(method)) auth.checkWrite(req, session);
                if (method === 'POST' && path === '/api/logout') {
                    res.setHeader('Set-Cookie', await auth.logout(req));
                    await collaboration.refresh();
                    return json(200, { signedOut: true });
                }
                if (path === '/api/projects') {
                    if (method === 'GET') {
                        const offset = Number(url.searchParams.get('offset') ?? 0);
                        const page = await projects.list(session.id, offset);
                        event = 'projects.list'; context.offset = offset; context.count = page.length; context.projectIds = page.map(project => project.id);
                        return json(200, { projects: page, nextOffset: page.length === 100 ? offset + 100 : null });
                    }
                    if (method === 'POST') {
                        const project = await projects.create(session.id, await body(req));
                        event = 'project.created'; context.projectId = project.id;
                        return json(201, project);
                    }
                }
                if (route) {
                    const [, id, action, member] = route;
                    if (action === 'live' && !member && method === 'GET') {
                        if (req.headers.origin && req.headers.origin !== config.origin) throw new HttpError(403, 'Invalid live connection origin.');
                        return await collaboration.open(req, res, session, id, url.searchParams.get('clientId'));
                    }
                    if (action === 'presence' && !member && method === 'POST') return json(200, await collaboration.presence(session, id, await body(req)));
                    if (action === 'edits' && !member && method === 'POST') {
                        const result = await projects.edit(session.id, id, await body(req));
                        collaboration.schedule();
                        return json(200, result);
                    }
                    if (!action) {
                        if (method === 'GET') { event = 'project.open'; return json(200, await projects.get(session.id, id)); }
                        if (method === 'PUT') return json(200, await projects.save(session.id, id, await body(req)));
                        if (method === 'DELETE') { event = 'project.deleted'; return json(200, await projects.remove(session.id, id, (await body(req)).expectedRevision)); }
                    }
                    if (action === 'view' && !member && method === 'PUT') return json(200, await projects.saveView(session.id, id, await body(req)));
                    if (action === 'members') {
                        if (!member && method === 'GET') return json(200, await projects.members(session.id, id));
                        if (member && ['PUT', 'DELETE'].includes(method)) {
                            event = 'project.sharing';
                            const role = method === 'PUT' ? (await body(req)).role : null;
                            if (role === null || ['editor', 'viewer'].includes(role)) context.role = role || 'removed';
                            const result = await projects.share(session.id, id, member, role);
                            // Record the committed permission even if the browser disconnects before the reply.
                            log(event, { ...context, status: 200, durationMs: Math.round(performance.now() - started) });
                            event = 'request.completed';
                            await collaboration.refresh();
                            return json(200, result);
                        }
                    }
                }
                throw new HttpError(404, 'Endpoint not found.');
            }
            if (['GET', 'HEAD'].includes(method)) {
                const name = path === '/' ? 'index.html' : path.slice(1);
                const asset = /^assets\/[a-zA-Z0-9_./-]+$/.test(name)
                    && !name.split('/').some(part => part.startsWith('.')) && mime[extname(name)] && extname(name) !== '.html';
                if (pages.has(name) || asset) {
                    let file;
                    try { file = await realpath(resolve(root, name)); } catch { throw new HttpError(404, 'File not found.'); }
                    const boundary = await realpath(asset ? resolve(root, 'assets') : root);
                    if (!file.startsWith(boundary + sep)) throw new HttpError(404, 'File not found.');
                    const contents = await readFile(file);
                    res.writeHead(200, { 'Content-Type': `${mime[extname(file)]}${['.html', '.js', '.css'].includes(extname(file)) ? '; charset=utf-8' : ''}`, 'Content-Length': contents.length });
                    return res.end(method === 'HEAD' ? undefined : contents);
                }
            }
            throw new HttpError(404, 'Page not found.');
        } catch (error) {
            context.errorCode = error instanceof HttpError ? 'HTTP_ERROR' : error instanceof URIError ? 'INVALID_URL' : errorCode(error);
            if (res.headersSent || res.destroyed) return;
            if (error instanceof URIError) return json(400, { error: 'Invalid URL.', requestId: context.requestId });
            if (!(error instanceof HttpError)) onError();
            json(error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : 'Server could not complete the request. Please retry.', ...(error instanceof HttpError ? error.details : {}), requestId: context.requestId });
        }
    });
    server.on('close', () => clearInterval(cleanup));
    const close = server.close.bind(server);
    server.close = callback => { collaboration.close(); return close(callback); };
    return server;
}
