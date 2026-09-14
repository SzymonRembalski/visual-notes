import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { transaction } from './database.mjs';
import { HttpError } from './validation.mjs';

const token = () => randomBytes(32).toString('base64url');
export const tokenHash = value => createHash('sha256').update(value).digest('hex');
const matches = (a, b) => typeof a === 'string' && typeof b === 'string'
    && timingSafeEqual(Buffer.from(tokenHash(a)), Buffer.from(tokenHash(b)));
const sessionSeconds = 7 * 24 * 60 * 60;

export class Auth {
    constructor(pool, config, provider) {
        this.pool = pool;
        this.config = config;
        this.secure = config.origin.startsWith('https:');
        this.sessionCookie = this.secure ? '__Host-vn_session' : 'vn_session';
        this.loginCookie = this.secure ? '__Host-vn_login' : 'vn_login';
        this.provider = provider ?? new OAuth2Client({
            clientId: config.googleClientId, clientSecret: config.googleClientSecret,
            redirectUri: `${config.origin}/auth/google/callback`,
            transporterOptions: { timeout: 10000, retry: false }
        });
    }

    cookie(name, value, seconds) {
        return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${this.secure ? '; Secure' : ''}`;
    }

    readCookie(req, name) {
        const values = (req.headers.cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
        if (values.length !== 1) return null;
        const value = values[0].slice(name.length + 1);
        return /^[\w-]{43}$/.test(value) ? value : null;
    }

    async begin(req) {
        const state = token();
        const nonce = token();
        const { codeVerifier, codeChallenge } = await this.provider.generateCodeVerifierAsync();
        const previous = this.readCookie(req, this.loginCookie);
        if (previous) await this.pool.query('DELETE FROM visual_notes.login_flows WHERE state_hash = $1', [tokenHash(previous)]);
        await this.pool.query(`INSERT INTO visual_notes.login_flows (state_hash, nonce, verifier, expires_at)
            VALUES ($1, $2, $3, now() + interval '10 minutes')`, [tokenHash(state), nonce, codeVerifier]);
        return {
            cookie: this.cookie(this.loginCookie, state, 600),
            location: this.provider.generateAuthUrl({ scope: ['openid', 'profile'], state, nonce,
                code_challenge: codeChallenge, code_challenge_method: 'S256', prompt: 'select_account' })
        };
    }

    async finish(req, params) {
        const state = params.get('state');
        const binding = this.readCookie(req, this.loginCookie);
        if (!binding || !matches(state, binding)) throw new HttpError(400, 'Sign-in expired or could not be verified. Please try again.');
        const { rows } = await this.pool.query(`DELETE FROM visual_notes.login_flows
            WHERE state_hash = $1 AND expires_at > now() RETURNING nonce, verifier`, [tokenHash(binding)]);
        const flow = rows[0];
        if (!flow || !params.get('code') || params.has('error')) throw new HttpError(400, 'Sign-in was cancelled or expired. Please try again.');
        let identity;
        try {
            const { tokens } = await this.provider.getToken({ code: params.get('code'), codeVerifier: flow.verifier });
            const ticket = await this.provider.verifyIdToken({ idToken: tokens.id_token, audience: this.config.googleClientId });
            identity = ticket.getPayload();
            if (!identity?.sub || !matches(identity.nonce, flow.nonce)) throw new Error();
        } catch {
            throw new HttpError(401, 'Google sign-in could not be verified. Please try again.');
        }
        const sessionToken = token();
        const csrf = token();
        const previous = this.readCookie(req, this.sessionCookie);
        await transaction(this.pool, async client => {
            // Serialize two first logins for the same verified identity.
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`google:${identity.sub}`]);
            let user = (await client.query(`SELECT user_id FROM visual_notes.identities WHERE provider = 'google' AND subject = $1`, [identity.sub])).rows[0]?.user_id;
            const name = String(identity.name || 'Visual Notes user').slice(0, 200);
            if (!user) {
                user = (await client.query('INSERT INTO visual_notes.users (display_name) VALUES ($1) RETURNING id', [name])).rows[0].id;
                await client.query(`INSERT INTO visual_notes.identities (provider, subject, user_id) VALUES ('google', $1, $2)`, [identity.sub, user]);
            } else await client.query('UPDATE visual_notes.users SET display_name = $2 WHERE id = $1', [user, name]);
            if (previous) await client.query('DELETE FROM visual_notes.sessions WHERE token_hash = $1', [tokenHash(previous)]);
            await client.query(`INSERT INTO visual_notes.sessions (token_hash, user_id, csrf_token, expires_at)
                VALUES ($1, $2, $3, now() + interval '7 days')`, [tokenHash(sessionToken), user, csrf]);
        });
        return [this.cookie(this.sessionCookie, sessionToken, sessionSeconds), this.cookie(this.loginCookie, '', 0)];
    }

    async session(req) {
        const sessionToken = this.readCookie(req, this.sessionCookie);
        if (!sessionToken) return null;
        return (await this.pool.query(`SELECT u.id, u.display_name AS "displayName", s.csrf_token AS "csrfToken"
            FROM visual_notes.sessions s JOIN visual_notes.users u ON u.id = s.user_id
            WHERE s.token_hash = $1 AND s.expires_at > now()`, [tokenHash(sessionToken)])).rows[0] ?? null;
    }

    checkWrite(req, session) {
        if (req.headers.origin !== this.config.origin || !matches(req.headers['x-csrf-token'], session.csrfToken)) {
            throw new HttpError(403, 'Request could not be verified. Reload and try again.');
        }
    }

    async logout(req) {
        const sessionToken = this.readCookie(req, this.sessionCookie);
        if (sessionToken) await this.pool.query('DELETE FROM visual_notes.sessions WHERE token_hash = $1', [tokenHash(sessionToken)]);
        return this.cookie(this.sessionCookie, '', 0);
    }

    async cleanup() {
        await this.pool.query('DELETE FROM visual_notes.sessions WHERE expires_at <= now()');
        await this.pool.query('DELETE FROM visual_notes.login_flows WHERE expires_at <= now()');
    }
}
