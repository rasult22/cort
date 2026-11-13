import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { GoogleProfile } from './store';

const GOOGLE_KEYS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** Checks a Google ID token and returns who it is about. Throws if the token is not good. */
export type GoogleVerifier = (credential: string) => Promise<GoogleProfile>;

/**
 * The browser gets an ID token from Google and hands it to us; we trust it
 * only after checking Google's signature, that it was issued for one of our
 * own client ids, and that it has not expired.
 *
 * `clientIds` may hold several: the web client now, the mobile apps later.
 * `keys` is replaceable so that tests can sign tokens themselves.
 */
export function googleVerifier(clientIds: string[], keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(GOOGLE_KEYS))): GoogleVerifier {
    return async (credential) => {
        const { payload } = await jwtVerify(credential, keys, { issuer: GOOGLE_ISSUERS, audience: clientIds });
        if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('The token names nobody');
        const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
        return {
            sub: payload.sub,
            email: payload.email_verified === false ? null : text(payload.email),
            // The first name is what friends call each other at the table.
            name: text(payload.given_name) ?? text(payload.name) ?? 'Игрок',
            picture: text(payload.picture),
        };
    };
}
