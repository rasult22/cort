import type { RunnerDelays, Seat } from '@cort/engine';
import type { ClientMessage, RoomSummary, ServerMessage } from '@cort/protocol';
import { randomInt } from 'node:crypto';
import { Room, RoomError, type Connection, type RoomSettings } from './room';

/** No look-alike characters, so a code survives being read out loud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const CODE_LENGTH = 4;
/** How long a table with nobody connected is kept, started or not, so players can come back. */
const ABANDONED_TTL_MS = 10 * 60_000;
const MAX_LISTED = 30;

interface Seated {
    room: Room;
    seat: Seat;
}

/** All tables on this server, and which connection sits where. */
export class Lobby {
    private rooms = new Map<string, Room>();
    private seats = new Map<Connection, Seated>();
    private expiry = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(private readonly delays?: Partial<RunnerDelays>) {}

    get roomCount(): number {
        return this.rooms.size;
    }

    /** Open tables anyone may join: those still gathering first, then the fullest. */
    openRooms(): RoomSummary[] {
        return [...this.rooms.values()]
            .flatMap((room) => room.summary ?? [])
            .sort((a, b) => Number(a.started) - Number(b.started) || b.players - a.players)
            .slice(0, MAX_LISTED);
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
        const seated = this.seats.get(connection);
        if (!seated) return;
        this.seats.delete(connection);
        seated.room.leave(seated.seat, connection);
        if (!seated.room.abandoned) return;
        // Nobody is connected, but they may only have switched apps: keep the table for a while.
        clearTimeout(this.expiry.get(seated.room.code));
        this.expiry.set(seated.room.code, setTimeout(() => this.remove(seated.room), ABANDONED_TTL_MS));
    }

    private dispatch(connection: Connection, message: ClientMessage): void {
        const seated = this.seats.get(connection);

        if (message.type === 'create' || message.type === 'join') {
            if (seated) throw new RoomError('badMessage', 'Вы уже в комнате');
            const room =
                message.type === 'create'
                    ? this.createRoom({ title: String(message.title ?? ''), open: message.open === true })
                    : this.rooms.get(String(message.code).toUpperCase());
            if (!room) throw new RoomError('roomNotFound', 'Комната не найдена');
            const token = message.type === 'join' ? message.token : undefined;
            const seat = room.join(connection, String(message.name ?? ''), token);
            this.seats.set(connection, { room, seat });
            clearTimeout(this.expiry.get(room.code));
            this.expiry.delete(room.code);
            return;
        }

        if (!seated) throw new RoomError('notInRoom', 'Сначала войдите в комнату');
        seated.room.handle(seated.seat, message);
    }

    private createRoom(settings: RoomSettings): Room {
        let code: string;
        do {
            code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
        } while (this.rooms.has(code));
        const room = new Room(code, settings, this.delays);
        this.rooms.set(code, room);
        return room;
    }

    private remove(room: Room): void {
        room.dispose();
        this.rooms.delete(room.code);
        clearTimeout(this.expiry.get(room.code));
        this.expiry.delete(room.code);
    }
}
