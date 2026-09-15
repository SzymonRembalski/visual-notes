import { randomUUID } from 'node:crypto';

const identifier = value => typeof value === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value);
const errorCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE']);
export const errorCode = error => /^[0-9A-Z]{5}$/.test(error?.code || '') || errorCodes.has(error?.code) ? error.code : 'UNEXPECTED';
export const requestId = () => randomUUID();

// Explicit fields only: never log bodies, URLs, cookies, tokens or database error text.
export function createLogger(write = line => process.stdout.write(line)) {
    return (event, fields = {}) => {
        const record = { time: new Date().toISOString(), level: fields.status >= 500 ? 'error' : fields.status >= 400 ? 'warn' : 'info', event };
        for (const key of ['requestId', 'userId', 'projectId', 'memberId']) if (identifier(fields[key])) record[key] = fields[key];
        for (const key of ['status', 'durationMs', 'count', 'offset']) if (Number.isFinite(fields[key])) record[key] = fields[key];
        for (const key of ['method', 'route', 'errorCode', 'role']) {
            if (typeof fields[key] === 'string' && /^[\w/.: -]{1,100}$/.test(fields[key])) record[key] = fields[key];
        }
        if (Array.isArray(fields.projectIds)) record.projectIds = fields.projectIds.filter(identifier).slice(0, 100);
        try { write(`${JSON.stringify(record)}\n`); } catch { /* Logging must not fail a saved request. */ }
    };
}
