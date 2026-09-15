import pg from 'pg';

export function createPool(config) {
    const pool = new pg.Pool({
        connectionString: config.databaseUrl,
        max: 10,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        statement_timeout: 15000,
        application_name: 'visual-notes'
    });
    // Connection errors may contain deployment details. Never log raw queries/URLs.
    pool.on('error', () => console.error('An idle database connection failed.'));
    return pool;
}

export async function transaction(pool, work) {
    const client = await pool.connect();
    let discard = false;
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch { discard = true; }
        throw error;
    } finally {
        client.release(discard);
    }
}

export async function checkDatabase(pool) {
    const result = await pool.query('SELECT version FROM visual_notes.schema_migrations ORDER BY version');
    if (result.rows.map(row => row.version).join(',') !== '1,2,3') {
        throw new Error('Database schema does not match this server. Run the matching migrations.');
    }
}
