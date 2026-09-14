import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../server/config.mjs';

const databaseUrl = 'postgresql://user:private-password@localhost:5432/boards';
const env = { DATABASE_URL: databaseUrl };
const load = (values = {}, args = []) => loadConfig({ args, env: { ...env, ...values } });

test('defaults require a database and bind to loopback', () => {
    assert.deepEqual(load(), { mode: 'development', host: '127.0.0.1', port: 3000, databaseUrl });
    assert.throws(() => loadConfig({ args: [], env: {} }), /DATABASE_URL/);
    assert.ok(Object.isFrozen(load()));
});

test('command line overrides environment, which overrides the selected file', t => {
    const directory = mkdtempSync(join(tmpdir(), 'visual-notes-config-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, 'private.env');
    writeFileSync(path, `# private fixture\nNODE_ENV=test\nHOST=localhost\nPORT=4000\nDATABASE_URL="${databaseUrl}"\n`);
    const args = ['--env-file', path];
    assert.deepEqual(loadConfig({ args, env: {} }), { mode: 'test', host: 'localhost', port: 4000, databaseUrl });
    const environment = { PORT: '5000', DATABASE_URL: 'postgres://other:secret@db/other' };
    const config = loadConfig({ args: [...args, '--port', '6000', '--host', '0.0.0.0'], env: environment });
    assert.equal(config.port, 6000);
    assert.equal(config.host, '0.0.0.0');
    assert.equal(config.databaseUrl, environment.DATABASE_URL);
    assert.equal(loadConfig({ args, env: environment }).port, 5000);
    assert.deepEqual(environment, { PORT: '5000', DATABASE_URL: 'postgres://other:secret@db/other' });
    assert.throws(() => loadConfig({ args, env: { DATABASE_URL: '' } }), /DATABASE_URL/);
    assert.throws(() => loadConfig({ args: [...args, '--port', ''], env: environment }), /PORT/);
    assert.throws(() => loadConfig({ args: ['--env-file', join(directory, 'missing.env')], env }), /Cannot read/);
});

test('rejects malformed values without including credentials in errors', () => {
    const invalid = {
        PORT: ['', '0', '65536', '1.5', '-1', '3e3', ' 3000', '3000junk'],
        HOST: ['', 'bad host', 'https://example.com', 'user@host', 'host/path'],
        NODE_ENV: ['', 'prod'],
        DATABASE_URL: ['', 'private-password', 'https://user:private-password@host/db', 'postgresql://host', 'postgresql:///db']
    };
    for (const [key, values] of Object.entries(invalid)) {
        for (const value of values) {
            assert.throws(() => load({ [key]: value }), error => {
                assert.ok(error.message.includes(key));
                assert.ok(!error.message.includes('private-password'));
                return true;
            }, `${key}=${value}`);
        }
    }
    assert.equal(load({ PORT: '65535', HOST: '::1', NODE_ENV: 'production' }).port, 65535);
});

test('rejects unexpected flags, positionals and secret flags without echoing their values', () => {
    for (const args of [['--database-url', databaseUrl], [databaseUrl], ['--port'], ['--port=42', '--unexpected']]) {
        assert.throws(() => load({}, args), error => {
            assert.equal(error.message, 'Invalid command-line options. Use --help for supported options.');
            return true;
        });
    }
    assert.equal(loadConfig({ args: ['--help'], env: {} }), null);
});

test('validation command reports success, failure and help without exposing the database URL', () => {
    const script = fileURLToPath(new URL('../server/check-config.mjs', import.meta.url));
    for (const [args, database, status, pattern] of [
        [[], databaseUrl, 0, /Database connection not tested/],
        [[], 'invalid-private-password', 1, /DATABASE_URL/],
        [['--help'], '', 0, /Usage:/],
        [['--database-url', databaseUrl], databaseUrl, 1, /Invalid command-line/]
    ]) {
        const result = spawnSync(process.execPath, [script, ...args], {
            encoding: 'utf8', env: { ...process.env, DATABASE_URL: database, HOST: '127.0.0.1', PORT: '3000', NODE_ENV: 'test' }
        });
        assert.ifError(result.error);
        assert.equal(result.status, status);
        assert.match(result.stdout + result.stderr, pattern);
        assert.doesNotMatch(result.stdout + result.stderr, /private-password/);
    }
});

test('server configuration requires Google credentials and a trusted public origin', () => {
    const environment = { ...env, APP_ORIGIN: 'https://test.example.com', GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret' };
    const serverConfig = values => loadConfig({ args: [], env: { ...environment, ...values }, server: true });
    assert.equal(serverConfig({}).origin, environment.APP_ORIGIN);
    assert.equal(serverConfig({ APP_ORIGIN: 'http://localhost:3000' }).origin, 'http://localhost:3000');
    for (const origin of ['', 'https://test.example.com/', 'https://test.example.com/path', 'https://user:secret@example.com', 'http://example.com', 'javascript:alert(1)']) {
        assert.throws(() => serverConfig({ APP_ORIGIN: origin }), /APP_ORIGIN/);
    }
    assert.throws(() => serverConfig({ NODE_ENV: 'production', APP_ORIGIN: 'http://localhost:3000' }), /APP_ORIGIN/);
    assert.throws(() => serverConfig({ GOOGLE_CLIENT_SECRET: '' }), /GOOGLE_CLIENT/);
    assert.throws(() => serverConfig({ GOOGLE_CLIENT_ID: '' }), /GOOGLE_CLIENT/);
});
