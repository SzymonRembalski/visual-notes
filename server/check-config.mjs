import { configHelp, loadConfig } from './config.mjs';

try {
    const config = loadConfig();
    if (!config) console.log(configHelp);
    else console.log(`Configuration valid (${config.mode}, ${config.host}:${config.port}). Database connection not tested.`);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
