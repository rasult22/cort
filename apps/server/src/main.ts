import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { Lobby } from './lobby';
import type { Connection } from './room';

const PORT = Number(process.env.PORT ?? 8787);
/** How often we check that each player is still there; a silent drop is noticed within two beats. */
const HEARTBEAT_MS = 10_000;
/** Largest message a client may send; real ones are well under 200 bytes. */
const MAX_PAYLOAD = 2048;

/** The built web client, if present, so one process can serve the whole game. */
const WEB_ROOT = resolve(fileURLToPath(new URL('../../web/dist', import.meta.url)));
const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.wav': 'audio/wav',
    '.txt': 'text/plain; charset=utf-8',
};

const lobby = new Lobby();

const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path === '/health') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true, rooms: lobby.roomCount }));
        return;
    }

    // Static files, falling back to index.html so links like /?room=ABCD work.
    let file = normalize(join(WEB_ROOT, path));
    if (!file.startsWith(WEB_ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
        file = join(WEB_ROOT, 'index.html');
    }
    if (!existsSync(file)) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Клиент не собран. Запустите: pnpm build');
        return;
    }
    response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
});

const sockets = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_PAYLOAD });
const alive = new WeakSet<WebSocket>();

sockets.on('connection', (socket) => {
    const connection: Connection = {
        send: (message) => {
            if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
        },
    };
    alive.add(socket);
    socket.on('pong', () => alive.add(socket));
    socket.on('message', (data) => lobby.receive(connection, data.toString()));
    socket.on('close', () => lobby.disconnect(connection));
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

server.listen(PORT, () => console.log(`Корт: сервер слушает http://localhost:${PORT}`));
