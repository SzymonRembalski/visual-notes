import { loadConfig, configHelp } from './config.mjs';
import { createPool, checkDatabase } from './database.mjs';
import { createApp } from './http.mjs';

let pool;
try {
    const config = loadConfig({ server: true });
    if (!config) console.log(configHelp);
    else {
        pool = createPool(config);
        await checkDatabase(pool);
        const app = createApp({ pool, config });
        await new Promise((resolve, reject) => {
            app.once('error', reject);
            app.listen(config.port, config.host, resolve);
        });
        console.log(`Visual Notes server listening on ${config.host}:${config.port}.`);
        let stopping = false;
        const shutdown = () => {
            if (stopping) return;
            stopping = true;
            const timeout = setTimeout(() => process.exit(1), 15000);
            timeout.unref();
            app.close(async () => {
                await pool.end();
                clearTimeout(timeout);
            });
        };
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    }
} catch {
    console.error('Server startup failed. Check configuration, database access and migrations.');
    await pool?.end();
    process.exitCode = 1;
}
