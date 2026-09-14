import { readFileSync } from 'node:fs';
import { parseArgs, parseEnv } from 'node:util';

export const configHelp = `Usage: node <server command> [options]
Commands: server/check-config.mjs, server/index.mjs, server/db/migrate.mjs
  --env-file PATH  Read a server-only configuration file
  --host HOST      Listen address (default: 127.0.0.1)
  --port PORT      Listen port (default: 3000)
  --help          Show this help

Precedence: command line > environment > optional file > defaults.
Set DATABASE_URL in the environment or file; secrets have no command-line flags.
check-config validates database/listen settings without connecting.
index starts the configured server; db/migrate applies database migrations.`;

export function loadConfig({ args = process.argv.slice(2), env = process.env, server = false } = {}) {
    let options;
    try {
        ({ values: options } = parseArgs({
            args,
            options: {
                'env-file': { type: 'string' },
                host: { type: 'string' },
                port: { type: 'string' },
                help: { type: 'boolean' }
            },
            strict: true,
            allowPositionals: false
        }));
    } catch {
        // Parser errors can include argument values; never echo possible secrets.
        throw new Error('Invalid command-line options. Use --help for supported options.');
    }
    if (options.help) return null;

    let fileValues = {};
    if (options['env-file'] !== undefined) {
        try {
            fileValues = parseEnv(readFileSync(options['env-file'], 'utf8'));
        } catch {
            throw new Error('Cannot read the requested environment file. Check its path and permissions.');
        }
    }
    const value = (name, fallback) => env[name] ?? fileValues[name] ?? fallback;
    const mode = value('NODE_ENV', 'development');
    const host = options.host ?? value('HOST', '127.0.0.1');
    const portText = options.port ?? value('PORT', '3000');
    const databaseUrl = value('DATABASE_URL');

    if (!['development', 'test', 'production'].includes(mode)) {
        throw new Error('NODE_ENV must be development, test or production.');
    }
    if (typeof host !== 'string' || !host || /[\s/\\?#@]/.test(host)) {
        throw new Error('HOST must be a hostname or IP address, without a URL scheme or whitespace.');
    }
    if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
        throw new Error('PORT must be an integer between 1 and 65535.');
    }
    try {
        const url = new URL(databaseUrl);
        if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length <= 1) {
            throw new Error();
        }
    } catch {
        throw new Error('DATABASE_URL must be a PostgreSQL connection URL with a hostname and database name.');
    }

    const config = { mode, host, port: Number(portText), databaseUrl };
    if (server) {
        const origin = value('APP_ORIGIN');
        try {
            const url = new URL(origin);
            if (url.origin !== origin || url.username || url.password ||
                (url.protocol !== 'https:' && !(mode !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error();
        } catch {
            throw new Error('APP_ORIGIN must be an HTTPS origin without a trailing slash (HTTP localhost is allowed outside production).');
        }
        const googleClientId = value('GOOGLE_CLIENT_ID');
        const googleClientSecret = value('GOOGLE_CLIENT_SECRET');
        if (!googleClientId || !googleClientSecret) throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required to run the server.');
        Object.assign(config, { origin, googleClientId, googleClientSecret });
    }
    return Object.freeze(config);
}
