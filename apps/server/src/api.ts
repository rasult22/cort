import type { HistoryResponse, MeResponse, RoomSummary } from '@cort/protocol';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GoogleVerifier } from './auth';
import type { Lobby } from './lobby';
import { toAccount, type Store, type User } from './store';

export const SESSION_COOKIE = 'cort_session';
const SESSION_SECONDS = 60 * 24 * 60 * 60;
/** Largest request body; the biggest real one is a Google ID token of about 1.5 KB. */
const MAX_BODY = 16 * 1024;

export interface AppOptions {
    store: Store;
    lobby: Lobby;
    /** Sign-in with Google, when a client id has been configured. */
    google: { clientIds: string[]; verify: GoogleVerifier } | null;
    /** Lets anyone sign in under any name. For development and tests only. */
    devLogin?: boolean;
    /** The built web client, served alongside the API so one process runs the whole game. */
    webRoot?: string;
}

interface Problem {
    error: string;
}

const deviceOf = (body: unknown): string | null => {
    const device = (body as { device?: unknown } | null)?.device;
    return typeof device === 'string' && /^[\w-]{8,64}$/.test(device) ? device : null;
};

/** The HTTP side of the server: accounts, history, the list of tables and the web client itself. */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
    const { store, lobby } = options;
    // Behind the host's proxy the real scheme arrives in a header; the cookie's Secure flag depends on it.
    const app = Fastify({ trustProxy: true, bodyLimit: MAX_BODY });
    await app.register(cookie);

    const currentUser = (request: FastifyRequest): Promise<User | null> => store.userBySession(request.cookies[SESSION_COOKIE]);

    const requireUser = async (request: FastifyRequest, reply: FastifyReply): Promise<User | null> => {
        const user = await currentUser(request);
        if (!user) void reply.code(401).send({ error: 'Войдите, чтобы продолжить' } satisfies Problem);
        return user;
    };

    const startSession = async (request: FastifyRequest, reply: FastifyReply, user: User): Promise<void> => {
        const device = deviceOf(request.body);
        if (device) await store.claimDevice(user.id, device);
        const token = await store.createSession(user.id);
        void reply.setCookie(SESSION_COOKIE, token, {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: request.protocol === 'https',
            maxAge: SESSION_SECONDS,
        });
    };

    app.get('/health', async () => ({ ok: true, rooms: lobby.roomCount }));

    const listRooms = async (_request: FastifyRequest, reply: FastifyReply): Promise<RoomSummary[]> => {
        void reply.header('cache-control', 'no-store');
        return lobby.openRooms();
    };
    app.get('/api/rooms', listRooms);
    // The address older clients ask.
    app.get('/rooms', listRooms);

    app.get<{ Params: { code: string } }>('/api/rooms/:code', async (request, reply) => {
        void reply.header('cache-control', 'no-store');
        const room = lobby.describe(request.params.code);
        if (!room) return reply.code(404).send({ error: 'Комната не найдена' } satisfies Problem);
        return room;
    });

    app.get('/api/me', async (request, reply): Promise<MeResponse> => {
        void reply.header('cache-control', 'no-store');
        const user = await currentUser(request);
        return {
            account: user ? toAccount(user) : null,
            signIn: { googleClientId: options.google?.clientIds[0] ?? null, dev: options.devLogin === true },
        };
    });

    app.post<{ Body: { credential?: unknown } | null }>('/api/auth/google', async (request, reply) => {
        const credential = request.body?.credential;
        if (!options.google || typeof credential !== 'string') {
            return reply.code(400).send({ error: 'Вход через Google сейчас недоступен' } satisfies Problem);
        }
        let profile;
        try {
            profile = await options.google.verify(credential);
        } catch (error) {
            request.log.warn(error);
            return reply.code(401).send({ error: 'Не удалось подтвердить вход через Google' } satisfies Problem);
        }
        const user = await store.signInWithGoogle(profile);
        await startSession(request, reply, user);
        return { account: toAccount(user) };
    });

    if (options.devLogin) {
        app.post<{ Body: { name?: unknown } | null }>('/api/auth/dev', async (request, reply) => {
            const user = await store.signInForDevelopment(String(request.body?.name ?? ''));
            await startSession(request, reply, user);
            return { account: toAccount(user) };
        });
    }

    app.post('/api/auth/logout', async (request, reply) => {
        const token = request.cookies[SESSION_COOKIE];
        if (token) await store.endSession(token);
        void reply.clearCookie(SESSION_COOKIE, { path: '/' });
        return { ok: true };
    });

    app.post<{ Body: { name?: unknown; avatar?: unknown } | null }>('/api/profile', async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const { name, avatar } = request.body ?? {};
        const updated = await store.updateProfile(user.id, {
            name: typeof name === 'string' ? name : undefined,
            avatar: typeof avatar === 'string' ? avatar : undefined,
        });
        return { account: toAccount(updated ?? user) };
    });

    app.delete('/api/account', async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        await store.deleteAccount(user.id);
        void reply.clearCookie(SESSION_COOKIE, { path: '/' });
        return { ok: true };
    });

    app.get('/api/history', async (request, reply): Promise<HistoryResponse | FastifyReply> => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        void reply.header('cache-control', 'no-store');
        return store.history(user.id);
    });

    const webRoot = options.webRoot;
    const hasClient = webRoot !== undefined && existsSync(join(webRoot, 'index.html'));
    if (hasClient) {
        await app.register(fastifyStatic, {
            root: webRoot,
            wildcard: false,
            setHeaders: (response, path) => {
                // Built assets carry a hash in their name and never change; the page itself must always be fresh.
                const assets = /[\\/]assets[\\/]/.test(path);
                const caching = assets ? 'public, max-age=31536000, immutable' : path.endsWith('.html') ? 'no-cache' : 'public, max-age=3600';
                void response.header('cache-control', caching);
            },
        });
    }

    app.setNotFoundHandler((request, reply) => {
        const path = request.url.split('?')[0];
        if (request.method !== 'GET' || path.startsWith('/api/') || path === '/ws') {
            return reply.code(404).send({ error: 'Не найдено' } satisfies Problem);
        }
        // Anything else is a page of the web client: links like /?room=ABCD must open it.
        if (hasClient) return reply.header('cache-control', 'no-cache').sendFile('index.html');
        return reply.code(404).type('text/plain; charset=utf-8').send('Клиент не собран. Запустите: pnpm build');
    });

    return app;
}
