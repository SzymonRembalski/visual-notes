import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadConfig, configHelp } from '../config.mjs';
import { createPool } from '../database.mjs';

// Explicit order: startup never silently changes the database schema.
export async function migrate(pool) {
    const client = await pool.connect();
    let discard = false;
    try {
        for (const name of ['001_accounts_projects.sql', '002_sessions_requests.sql']) {
            await client.query(await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8'));
        }
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch { discard = true; }
        throw error;
    } finally {
        client.release(discard);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    let pool;
    try {
        const config = loadConfig();
        if (!config) console.log(configHelp);
        else {
            pool = createPool(config);
            await migrate(pool);
            console.log('Database migrations applied successfully.');
        }
    } catch {
        console.error('Migration failed. Check configuration, database access and the matching schema version.');
        process.exitCode = 1;
    } finally {
        await pool?.end();
    }
}
