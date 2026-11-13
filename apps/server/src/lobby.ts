import type { RunnerDelays } from '@cort/engine';
import type { ClientMessage, RoomSummary, ServerMessage } from '@cort/protocol';
import { randomInt } from 'node:crypto';
import type { RoomSnapshot } from './db/schema';
import { Room, RoomError, type Connection, type RoomHooks, type RoomSettings } from './room';
import type { MatchRecord } from './store';

/** No look-alike characters, so a code survives being read out loud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const CODE_LENGTH = 4;
/** How long a table with nobody connected is kept, started or not, so players can come back. */
export const ABANDONED_TTL_MS = 10 * 60_000;
const MAX_LISTED = 30;

export interface LobbyOptions {
    delays?: Partial<RunnerDelays>;
    /** How long a person may think about a move, in ms. Without it nobody is timed. */
    turnMs?: number;
    /** Keeps tables between restarts. */
    archive?: { save(code: string, snapshot: RoomSnapshot): void; remove(code: string): void };
    /** A match was played to the end. */
    onMatch?: (record: MatchRecord) => void;
}

/** All tables on this server, and which connection is at which. */
export class Lobby {
    private rooms = new Map<string, Room>();
    private places = new Map<Connection, Room>();
    private expiry = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly hooks: RoomHooks;

    constructor(private readonly options: LobbyOptions = {}) {
        this.hooks = {
            delays: options.delays,
            turnMs: options.turnMs,
            onMatch: options.onMatch,
            onChange: (room) => this.options.archive?.save(room.code, room.snapshot()),
        };
    }

    get roomCount(): number {
        return this.rooms.size;
    }

    /** Open tables anyone may join or watch: those still gathering first, then the fullest. */
    openRooms(): RoomSummary[] {
        return [...this.rooms.values()]
            .flatMap((room) => room.summary ?? [])
            .sort((a, b) => Number(a.started) - Number(b.started) || b.players - a.players)
            .slice(0, MAX_LISTED);
    }

    /** What someone holding a table's code may know about it before going in. */
    describe(code: string): RoomSummary | null {
        return this.rooms.get(code.toUpperCase())?.describe() ?? null;
    }

    /** Puts back the tables that were in progress when the server last stopped. */
    restore(snapshots: RoomSnapshot[]): void {
        for (const snapshot of snapshots) {
            if (this.rooms.has(snapshot.code)) continue;
            const room = Room.revive(snapshot, this.hooks);
            this.rooms.set(room.code, room);
            // Nobody is here yet. If nobody comes back, the table goes the way of any abandoned one.
            this.expire(room);
        }
    }

    /** Stops every table without closing it: the tables are saved and will be revived. */
    freeze(): void {
        this.rooms.forEach((room) => room.freeze());
        this.expiry.forEach((timer) => clearTimeout(timer));
        this.expiry.clear();
    }

    /** Handles one raw message from a client. Never throws. */
    receive(connection: Connection, raw: string): void {
        try {
            const message = JSON.parse(raw) as ClientMessage;
            if (typeof message?.type !== 'string') throw new RoomError('badMessage', 'Неизвестное сообщение');
            this.dispatch(connection, message);
        } catch (error) {
            const known = error instanceof RoomError;
            if (!known && !(error instanceof SyntaxError)) console.error(error);
            const reply: ServerMessage = known
                ? { type: 'error', code: error.code, message: error.message }
                : { type: 'error', code: 'badMessage', message: 'Не удалось обработать сообщение' };
            connection.send(reply);
        }
    }

    disconnect(connection: Connection): void {
        const room = this.places.get(connection);
        if (!room) return;
        this.places.delete(connection);
        room.leave(connection);
        // Nobody is connected, but they may only have switched apps: keep the table for a while.
        if (room.abandoned && this.rooms.get(room.code) === room) this.expire(room);
    }

    private dispatch(connection: Connection, message: ClientMessage): void {
        const current = this.places.get(connection);

        if (message.type === 'create' || message.type === 'join') {
            if (current) throw new RoomError('badMessage', 'Вы уже в комнате');
            let room: Room | undefined;
            if (message.type === 'create') {
                const open = message.open === true;
                if (open && !connection.user) throw new RoomError('authRequired', 'Открытую комнату можно создать после входа');
                room = this.createRoom({ title: String(message.title ?? ''), open });
            } else {
                room = this.rooms.get(String(message.code).toUpperCase());
            }
            if (!room) throw new RoomError('roomNotFound', 'Комната не найдена');
            try {
                room.enter(connection, message);
            } catch (error) {
                // A table nobody managed to enter must not linger.
                if (message.type === 'create') this.remove(room);
                throw error;
            }
            this.places.set(connection, room);
            // A spectator alone does not keep a table alive: only a player coming back stops the countdown.
            if (!room.abandoned) {
                clearTimeout(this.expiry.get(room.code));
                this.expiry.delete(room.code);
            }
            return;
        }

        if (!current) throw new RoomError('notInRoom', 'Сначала войдите в комнату');
        current.handle(connection, message);
    }

    private createRoom(settings: RoomSettings): Room {
        let code: string;
        do {
            code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
        } while (this.rooms.has(code));
        const room = new Room(code, settings, this.hooks);
        this.rooms.set(code, room);
        return room;
    }

    private expire(room: Room): void {
        clearTimeout(this.expiry.get(room.code));
        this.expiry.set(
            room.code,
            setTimeout(() => this.remove(room), ABANDONED_TTL_MS),
        );
    }

    private remove(room: Room): void {
        room.dispose();
        this.rooms.delete(room.code);
        clearTimeout(this.expiry.get(room.code));
        this.expiry.delete(room.code);
        for (const [connection, place] of this.places) {
            if (place === room) this.places.delete(connection);
        }
        this.options.archive?.remove(room.code);
    }
}
