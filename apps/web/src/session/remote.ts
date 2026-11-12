import type { Card, Seat, Suit } from '@cort/engine';
import type { ClientMessage, ServerMessage } from '@cort/protocol';
import { BaseSession, type Session } from './session';

const RECONNECT_MS = 1500;
const TOKEN_PREFIX = 'cort.token.';

export interface RemoteOptions {
    name: string;
    /** Room to join; omit to create a new one. */
    code?: string;
    url?: string;
}

const defaultUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

/** A table that lives on the server. Reconnects by itself and reclaims its seat. */
export class RemoteSession extends BaseSession implements Session {
    private socket: WebSocket | null = null;
    private code: string | null;
    private seat: Seat = 0;
    private disposed = false;
    private retry: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly options: RemoteOptions) {
        super();
        this.code = options.code?.toUpperCase() ?? null;
        this.connect();
    }

    start(): void {
        this.send({ type: 'start' });
    }

    chooseTrump(suit: Suit): void {
        this.send({ type: 'action', action: { type: 'chooseTrump', seat: this.seat, suit } });
    }

    playCard(card: Card): void {
        this.send({ type: 'action', action: { type: 'playCard', seat: this.seat, card } });
    }

    rematch(): void {
        this.send({ type: 'rematch' });
    }

    emote(emote: string): void {
        this.send({ type: 'emote', emote });
    }

    dispose(): void {
        this.disposed = true;
        if (this.retry) clearTimeout(this.retry);
        this.socket?.close();
    }

    private connect(): void {
        const socket = new WebSocket(this.options.url ?? defaultUrl());
        this.socket = socket;

        socket.onopen = () => {
            this.emit({ type: 'connection', online: true });
            if (this.code) {
                this.send({ type: 'join', code: this.code, name: this.options.name, token: loadToken(this.code) });
            } else {
                this.send({ type: 'create', name: this.options.name });
            }
        };

        socket.onmessage = (message) => {
            const data = JSON.parse(String(message.data)) as ServerMessage;
            switch (data.type) {
                case 'joined':
                    this.code = data.code;
                    this.seat = data.seat;
                    saveToken(data.code, data.token);
                    history.replaceState(null, '', `?room=${data.code}`);
                    break;
                case 'room':
                    this.emit({ type: 'room', room: data.room, seat: this.seat });
                    break;
                case 'update':
                    this.emit({ type: 'update', view: data.view, events: data.events });
                    break;
                case 'emote':
                    this.emit({ type: 'emote', seat: data.seat, emote: data.emote });
                    break;
                case 'error':
                    this.emit({ type: 'error', message: data.message });
                    // Nothing to reconnect to: stop trying.
                    if (data.code === 'roomNotFound' || data.code === 'roomFull') this.disposed = true;
                    break;
            }
        };

        socket.onclose = () => {
            if (this.disposed) return;
            this.emit({ type: 'connection', online: false });
            this.retry = setTimeout(() => this.connect(), RECONNECT_MS);
        };
    }

    private send(message: ClientMessage): void {
        if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
    }
}

function loadToken(code: string): string | undefined {
    try {
        return sessionStorage.getItem(TOKEN_PREFIX + code) ?? undefined;
    } catch {
        return undefined;
    }
}

function saveToken(code: string, token: string): void {
    try {
        sessionStorage.setItem(TOKEN_PREFIX + code, token);
    } catch {
        // Without storage a reconnect simply takes a new seat.
    }
}
