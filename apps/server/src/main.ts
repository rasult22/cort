import type { IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { buildApp, SESSION_COOKIE } from './api';
import { googleVerifier } from './auth';
import { openDb } from './db/open';
import { ABANDONED_TTL_MS, Lobby } from './lobby';
import type { Connection, Identity } from './room';
import { shownAvatar, Store } from './store';

const here = (path: string): string => resolve(fileURLToPath(new URL(path, import.meta.url)));

// Local settings, if there are any. In production there is no such file: the host sets the variables.
try {
    process.loadEnvFile(here('../.env'));
} catch {
    // No file: the environment is all there is.
}

const PORT = Number(process.env.PORT ?? 8787);
const PRODUCTION = process.env.NODE_ENV === 'production';
/** How often we check that each player is still there; a silent drop is noticed within two beats. */
const HEARTBEAT_MS = 10_000;
/** Largest message a client may send; real ones are well under 200 bytes. */
const MAX_PAYLOAD = 2048;
/** How long a person may think about a move before it is made for them. */
const TURN_MS = Number(process.env.TURN_SECONDS ?? 30) * 1000;
const HOUR_MS = 60 * 60_000;

/** The built web client, if present, so one process can serve the whole game. */
const WEB_ROOT = here('../../web/dist');

// Accounts, history and tables in progress. Without DATABASE_URL they live in a local folder.
const database = await openDb({
    url: process.env.DATABASE_URL,
    dataDir: process.env.DATA_DIR ?? here('../.data/pg'),
});
const store = new Store(database.db);
console.log(`Корт: данные — ${database.describe}`);
if (PRODUCTION && !process.env.DATABASE_URL) {
    console.warn('Корт: DATABASE_URL не задан — аккаунты и история не переживут новую выкладку.');
}

const lobby = new Lobby({
    // For checking a whole match by hand or by script without waiting ten minutes for it.
    delays: !PRODUCTION && process.env.FAST_BOTS === '1' ? { botTrump: 400, firstLead: 400, botMove: 200, afterTrick: 700, nextHand: 1200 } : undefined,
    turnMs: TURN_MS > 0 ? TURN_MS : undefined,
    archive: {
        save: (code, snapshot) => store.saveRoom(code, snapshot),
        remove: (code) => store.removeRoom(code),
    },
    onMatch: (record) => void store.saveMatch(record).catch((error) => console.error('Не удалось сохранить партию:', error)),
});
const revived = await store.loadRooms(ABANDONED_TTL_MS);
lobby.restore(revived);
if (revived.length) console.log(`Корт: возвращено столов после перезапуска — ${revived.length}`);

// Several ids may be listed, comma-separated: the web client first, the mobile apps after it.
const googleClientIds = (process.env.GOOGLE_CLIENT_ID ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
if (googleClientIds.length === 0) console.warn('Корт: GOOGLE_CLIENT_ID не задан — вход через Google выключен.');

const app = await buildApp({
    store,
    lobby,
    google: googleClientIds.length ? { clientIds: googleClientIds, verify: googleVerifier(googleClientIds) } : null,
    // Never in production: it lets anyone be anyone.
    devLogin: !PRODUCTION && process.env.DEV_LOGIN === '1',
    webRoot: WEB_ROOT,
});

const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
const alive = new WeakSet<WebSocket>();
let stopping = false;

/** Who is behind a new connection: the account of its session cookie, or nobody (a guest). */
async function identify(request: IncomingMessage): Promise<Identity | null> {
    // A page from another site must not act as the person signed in here.
    const origin = request.headers.origin;
    if (origin && new URL(origin).host !== request.headers.host) return null;
    const token = app.parseCookie(request.headers.cookie ?? '')[SESSION_COOKIE];
    const user = await store.userBySession(token);
    return user ? { userId: user.id, name: user.name, avatar: shownAvatar(user) } : null;
}

app.server.on('upgrade', (request, socket, head) => {
    if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/ws') {
        socket.destroy();
        return;
    }
    void identify(request)
        .catch((error) => {
            console.error(error);
            return null;
        })
        .then((user) => sockets.handleUpgrade(request, socket, head, (ws) => sockets.emit('connection', ws, request, user)));
});

sockets.on('connection', (socket: WebSocket, _request: IncomingMessage, user: Identity | null) => {
    const connection: Connection = {
        user,
        send: (message) => {
            if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
        },
    };
    alive.add(socket);
    socket.on('pong', () => alive.add(socket));
    socket.on('message', (data) => lobby.receive(connection, data.toString()));
    socket.on('close', () => {
        // While shutting down the tables are already saved as they were; players come back to them after the restart.
        if (!stopping) lobby.disconnect(connection);
    });
    socket.on('error', () => socket.terminate());
});

// Drop connections that silently died (phone went to sleep, Wi-Fi dropped).
setInterval(() => {
    for (const socket of sockets.clients) {
        if (!alive.has(socket)) {
            socket.terminate();
            continue;
        }
        alive.delete(socket);
        socket.ping();
    }
}, HEARTBEAT_MS);

setInterval(() => void store.forgetExpiredSessions().catch(console.error), 12 * HOUR_MS);

/** A new version is being rolled out: save every table so the evening carries on after the restart. */
async function shutdown(): Promise<void> {
    if (stopping) return;
    stopping = true;
    lobby.freeze();
    await store.flushRooms();
    await database.close().catch(console.error);
    process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

// Every address of the machine, IPv6 and IPv4 alike — or IPv4 alone where there is no IPv6.
await app.listen({ port: PORT, host: '::' }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EAFNOSUPPORT' && error.code !== 'EADDRNOTAVAIL') throw error;
    return app.listen({ port: PORT, host: '0.0.0.0' });
});
console.log(`Корт: сервер слушает http://localhost:${PORT}`);
