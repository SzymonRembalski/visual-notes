import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { migrate } from '../server/db/migrate.mjs';

const canvasOnly = process.argv.includes('--canvas');

const execute = promisify(execFile);
const platform = process.platform === 'win32' ? 'windows' : process.platform;
const binaries = await import(`@embedded-postgres/${platform}-${process.arch}`);
const temporaryRoot = await realpath(tmpdir());
const directory = await mkdtemp(join(temporaryRoot, 'visual-notes-db-'));
const data = join(directory, 'data');
const password = randomBytes(24).toString('hex');
const passwordFile = join(directory, 'password');
const socket = createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const connectionString = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
let databaseProcess;
let databaseLog = '';

async function start() {
    databaseProcess = spawn(binaries.postgres, ['-D', data, '-p', String(port), '-h', '127.0.0.1'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    databaseProcess.on('error', error => { databaseLog += error.message; });
    databaseProcess.stdout.on('data', chunk => { databaseLog += chunk; });
    databaseProcess.stderr.on('data', chunk => { databaseLog += chunk; });
    for (let attempt = 0; attempt < 200; attempt++) {
        const client = new pg.Client({ connectionString, connectionTimeoutMillis: 200 });
        try { await client.connect(); await client.end(); return; }
        catch { await client.end().catch(() => {}); }
        if (databaseProcess.exitCode !== null) break;
        await delay(50);
    }
    throw new Error(`Temporary PostgreSQL did not start: ${databaseLog}`);
}

async function stop() {
    if (databaseProcess?.exitCode === null) {
        await execute(binaries.pg_ctl, ['stop', '-D', data, '-m', 'fast', '-w'], { windowsHide: true, timeout: 15000 });
        databaseProcess = null;
    }
}

try {
    await writeFile(passwordFile, password, { mode: 0o600 });
    await execute(binaries.initdb, ['-D', data, '-U', 'postgres', '--auth=scram-sha-256', `--pwfile=${passwordFile}`, '--encoding=UTF8', '--locale=C'], { windowsHide: true, timeout: 30000 });
    await start();
    if (canvasOnly) {
        const pool = new pg.Pool({ connectionString });
        try { await migrate(pool); } finally { await pool.end(); }
    }
    for (const file of canvasOnly ? ['tests/canvas-saving.integration.mjs'] : ['tests/database.integration.mjs', 'tests/server-browser.integration.mjs', 'tests/collaboration.integration.mjs', 'tests/canvas-saving.integration.mjs']) {
        const code = await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, ['--test', '--test-timeout=90000', file], {
                windowsHide: true, stdio: 'inherit', env: { ...process.env, TEST_DATABASE_URL: connectionString }
            });
            child.on('error', reject);
            child.on('exit', resolve);
        });
        if (code !== 0) throw new Error(`Integration tests failed: ${file}`);
    }
    await stop();
    await start();
    const client = new pg.Client({ connectionString });
    try {
        await client.connect();
        const title = canvasOnly ? 'Canvas saving fixture' : 'Restart durability fixture';
        const result = await client.query(`SELECT count(*) FROM visual_notes.projects WHERE document->>'title' = $1`, [title]);
        if (Number(result.rows[0].count) < 1) throw new Error('Saved project did not survive database restart.');
    } finally { await client.end(); }
    console.log('PostgreSQL restart durability passed.');
} finally {
    await stop();
    // Delete only the dedicated temporary cluster created above, after shutdown.
    if (dirname(directory) !== temporaryRoot || !basename(directory).startsWith('visual-notes-db-')) throw new Error('Unexpected temporary database path.');
    await rm(directory, { recursive: true, force: true });
}
