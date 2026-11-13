import { DEFAULT_RULES, type Seat } from '@cort/engine';
import type { HistoryResponse, MeResponse } from '@cort/protocol';
import type { FastifyInstance } from 'fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, SESSION_COOKIE } from './api';
import { googleVerifier } from './auth';
import { openDb, type OpenDb } from './db/open';
import type { RoomSnapshot } from './db/schema';
import { Lobby } from './lobby';
import { Store, type GoogleProfile, type MatchRecord } from './store';

const CLIENT_ID = 'cort-web.apps.googleusercontent.com';

/** A match as a table would hand it over: seats 0+2 against 1+3. */
function match(players: MatchRecord['players'], winner: 0 | 1, hands: MatchRecord['hands']): MatchRecord {
    const score: [number, number] = [hands.filter((h) => h.winner === 0).length, hands.filter((h) => h.winner === 1).length];
    return {
        roomCode: 'TEST',
        startedAt: Date.now() - 600_000,
        endedAt: Date.now(),
        seed: 7,
        rules: DEFAULT_RULES,
        score,
        winner,
        hands,
        actions: ['th', 'As'],
        players,
    };
}

const human = (seat: Seat, name: string, id: { userId?: string; deviceId?: string } = {}): MatchRecord['players'][number] => ({
    seat,
    kind: 'human',
    userId: id.userId ?? null,
    deviceId: id.deviceId ?? null,
    name,
    avatar: null,
});
const bot = (seat: Seat, name: string): MatchRecord['players'][number] => ({ seat, kind: 'bot', userId: null, deviceId: null, name, avatar: null });

describe('accounts and history over HTTP', () => {
    let database: OpenDb;
    let store: Store;
    let app: FastifyInstance;
    /** What the fake Google says about each credential. */
    const profiles: Record<string, GoogleProfile> = {
        rasul: { sub: 'g-1', email: 'rasul@example.com', name: 'Расул', picture: 'https://lh3.googleusercontent.com/a/rasul=s96-c' },
        aliya: { sub: 'g-2', email: 'aliya@example.com', name: 'Алия', picture: null },
    };

    beforeAll(async () => {
        database = await openDb();
        store = new Store(database.db);
        app = await buildApp({
            store,
            lobby: new Lobby(),
            google: {
                clientIds: [CLIENT_ID],
                verify: async (credential) => {
                    const profile = profiles[credential];
                    if (!profile) throw new Error('bad token');
                    return profile;
                },
            },
        });
    }, 60_000);
    afterAll(async () => {
        await app.close();
        await database.close();
    });

    /** Signs in and returns the session cookie, the way a browser would keep it. */
    async function signIn(credential: string, device?: string): Promise<{ cookie: string; id: string }> {
        const response = await app.inject({ method: 'POST', url: '/api/auth/google', payload: { credential, device } });
        expect(response.statusCode).toBe(200);
        const session = response.cookies.find((c) => c.name === SESSION_COOKIE)!;
        expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
        return { cookie: `${SESSION_COOKIE}=${session.value}`, id: response.json().account.id };
    }

    const get = async <T>(url: string, cookie?: string): Promise<{ status: number; body: T }> => {
        const response = await app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
        return { status: response.statusCode, body: response.json() as T };
    };

    it('tells a visitor how to sign in, and that they are nobody yet', async () => {
        const { body } = await get<MeResponse>('/api/me');
        expect(body).toEqual({ account: null, signIn: { googleClientId: CLIENT_ID, dev: false } });
        expect((await get('/api/history')).status).toBe(401);
        // The development sign-in does not exist unless it was asked for.
        expect((await app.inject({ method: 'POST', url: '/api/auth/dev', payload: { name: 'Кто угодно' } })).statusCode).toBe(404);
    });

    it('creates an account on the first Google sign-in and recognises it afterwards', async () => {
        const first = await signIn('rasul');
        const me = (await get<MeResponse>('/api/me', first.cookie)).body.account;
        expect(me).toEqual({
            id: first.id,
            name: 'Расул',
            avatar: profiles.rasul.picture,
            photo: profiles.rasul.picture,
            email: 'rasul@example.com',
        });

        const second = await signIn('rasul');
        expect(second.id).toBe(first.id);
        expect(second.cookie).not.toBe(first.cookie);

        const refused = await app.inject({ method: 'POST', url: '/api/auth/google', payload: { credential: 'forged' } });
        expect(refused.statusCode).toBe(401);
        expect(refused.cookies).toEqual([]);
    });

    it('lets a person change their name and picture, and keeps the change on the next sign-in', async () => {
        const { cookie } = await signIn('rasul');
        const post = (payload: object) => app.inject({ method: 'POST', url: '/api/profile', headers: { cookie }, payload });

        expect((await post({ name: '  Расул   Т.  ', avatar: 'preset:5' })).json().account).toMatchObject({ name: 'Расул Т.', avatar: 'preset:5' });
        // Nonsense is ignored rather than stored.
        expect((await post({ name: '   ', avatar: 'https://evil.example/x.png' })).json().account).toMatchObject({ name: 'Расул Т.', avatar: 'preset:5' });
        expect((await post({ avatar: 'none' })).json().account.avatar).toBeNull();

        const again = await signIn('rasul');
        expect((await get<MeResponse>('/api/me', again.cookie)).body.account).toMatchObject({ name: 'Расул Т.', avatar: null });
        expect((await post({ name: 'Расул', avatar: 'photo' })).json().account.avatar).toBe(profiles.rasul.picture);
    });

    it('forgets the session on sign-out', async () => {
        const { cookie } = await signIn('aliya');
        expect((await get<MeResponse>('/api/me', cookie)).body.account?.name).toBe('Алия');
        await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
        expect((await get<MeResponse>('/api/me', cookie)).body.account).toBeNull();
    });

    it('shows a player their matches, their totals and their record with each person', async () => {
        const rasul = await signIn('rasul');
        const aliya = await signIn('aliya');
        const sweep = { caller: 0 as Seat, trump: 'hearts', tricks: [7, 0] as [number, number], winner: 0 as const };
        const close = { caller: 1 as Seat, trump: 'spades', tricks: [5, 7] as [number, number], winner: 1 as const };

        // Together against a guest and a bot: won 2:1, one hand dry.
        await store.saveMatch(
            match([human(0, 'Расул', { userId: rasul.id }), human(1, 'Тимур', { deviceId: 'device-timur' }), human(2, 'Алия', { userId: aliya.id }), bot(3, 'Рамиля')], 0, [
                sweep,
                close,
                { ...sweep, tricks: [7, 4] },
            ]),
        );
        // Against each other: Aliya's side takes it.
        await store.saveMatch(
            match([human(0, 'Расул', { userId: rasul.id }), human(1, 'Алия', { userId: aliya.id }), bot(2, 'Ильхам'), human(3, 'Тимур', { deviceId: 'device-timur' })], 1, [close]),
        );

        const { body } = await get<HistoryResponse>('/api/history', rasul.cookie);
        expect(body.stats).toEqual({ matches: 2, wins: 1, hands: 4, handsWon: 2, dryWins: 1, calls: 2 });

        // Newest first.
        expect(body.matches.map((m) => [m.won, m.score])).toEqual([
            [false, [0, 1]],
            [true, [2, 1]],
        ]);
        expect(body.matches[1].players.map((p) => [p.name, p.kind, p.me])).toEqual([
            ['Расул', 'human', true],
            ['Тимур', 'human', false],
            ['Алия', 'human', false],
            ['Рамиля', 'bot', false],
        ]);
        expect(body.matches[1].hands).toHaveLength(3);
        expect(body.matches[1].duration).toBe(600);

        // People only: bots have no record. The most familiar face comes first.
        expect(body.rivals).toEqual([
            { name: 'Алия', avatar: null, together: { matches: 1, wins: 1 }, against: { matches: 1, wins: 0 } },
            { name: 'Тимур', avatar: null, together: { matches: 0, wins: 0 }, against: { matches: 2, wins: 1 } },
        ]);

        // The other side of the same table.
        const hers = (await get<HistoryResponse>('/api/history', aliya.cookie)).body;
        expect(hers.stats).toMatchObject({ matches: 2, wins: 2, dryWins: 1, calls: 1 });
    });

    it('moves games played as a guest to the account when that device signs in', async () => {
        profiles.timur = { sub: 'g-3', email: null, name: 'Тимур', picture: null };
        const timur = await signIn('timur', 'device-timur');
        const { body } = await get<HistoryResponse>('/api/history', timur.cookie);
        expect(body.stats).toMatchObject({ matches: 2, wins: 1 });
        expect(body.matches.every((m) => m.players.some((p) => p.me && p.name === 'Тимур'))).toBe(true);
    });

    it('deletes an account without tearing holes in other people’s history', async () => {
        const aliya = await signIn('aliya');
        const gone = await app.inject({ method: 'DELETE', url: '/api/account', headers: { cookie: aliya.cookie } });
        expect(gone.statusCode).toBe(200);
        expect((await get<MeResponse>('/api/me', aliya.cookie)).body.account).toBeNull();

        const rasul = await signIn('rasul');
        const { body } = await get<HistoryResponse>('/api/history', rasul.cookie);
        expect(body.stats.matches).toBe(2);
        expect(body.matches[1].players.map((p) => p.name)).toEqual(['Расул', 'Тимур', 'Игрок', 'Рамиля']);
    });

    it('lists open tables and describes a table to someone holding its code', async () => {
        expect((await get('/api/rooms')).body).toEqual([]);
        expect((await get('/rooms')).body).toEqual([]);
        expect((await get('/api/rooms/ZZZZ')).status).toBe(404);
        expect((await get('/health')).body).toEqual({ ok: true, rooms: 0 });
    });

    it('keeps tables in progress between restarts, and drops the stale ones', async () => {
        const table = (code: string): RoomSnapshot => ({ code, title: `Стол ${code}`, open: false, host: 0, members: [null, null, null, null], game: null, match: null });
        store.saveRoom('AAAA', table('AAAA'));
        store.saveRoom('BBBB', table('BBBB'));
        // Several changes in a row are written once, with the latest state.
        store.saveRoom('AAAA', { ...table('AAAA'), title: 'Вечерний корт' });
        await store.flushRooms();
        store.removeRoom('BBBB');
        await store.flushRooms();

        expect(await store.loadRooms(60_000)).toEqual([{ ...table('AAAA'), title: 'Вечерний корт' }]);
        // Nothing saved is recent enough for a window of zero: everything goes.
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(await store.loadRooms(0)).toEqual([]);
    });
});

describe('Google ID tokens', () => {
    it('accepts a token Google signed for us, and nothing else', async () => {
        const google = await generateKeyPair('RS256');
        const stranger = await generateKeyPair('RS256');
        const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(google.publicKey)), kid: 'k1', alg: 'RS256' }] });
        const verify = googleVerifier([CLIENT_ID, 'cort-android.apps.googleusercontent.com'], keys);

        const token = (claims: Record<string, unknown>, options: { key?: typeof google.privateKey; audience?: string; expires?: string; issuer?: string } = {}) =>
            new SignJWT({ sub: '1234567890', email: 'rasul@example.com', email_verified: true, name: 'Расул Т', given_name: 'Расул', picture: 'https://lh3/p', ...claims })
                .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
                .setIssuer(options.issuer ?? 'https://accounts.google.com')
                .setAudience(options.audience ?? CLIENT_ID)
                .setIssuedAt()
                .setExpirationTime(options.expires ?? '1h')
                .sign(options.key ?? google.privateKey);

        expect(await verify(await token({}))).toEqual({ sub: '1234567890', email: 'rasul@example.com', name: 'Расул', picture: 'https://lh3/p' });
        // The mobile app's client id is ours too.
        expect((await verify(await token({}, { audience: 'cort-android.apps.googleusercontent.com' }))).sub).toBe('1234567890');
        // An address Google has not confirmed is not kept.
        expect((await verify(await token({ email_verified: false, given_name: undefined }))).email).toBeNull();

        await expect(verify(await token({}, { audience: 'someone-else.apps.googleusercontent.com' }))).rejects.toThrow();
        await expect(verify(await token({}, { key: stranger.privateKey }))).rejects.toThrow();
        await expect(verify(await token({}, { expires: '-1h' }))).rejects.toThrow();
        await expect(verify(await token({}, { issuer: 'https://accounts.example.com' }))).rejects.toThrow();
        await expect(verify('not-a-token')).rejects.toThrow();
    });
});
