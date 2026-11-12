import { GameRunner, RANKS, RuleError, SUITS, viewFor, type Action, type RunnerDelays, type Seat } from '@cort/engine';
import {
    isReaction,
    MAX_TITLE,
    type ClientMessage,
    type ErrorCode,
    type RoomInfo,
    type RoomSummary,
    type ServerMessage,
} from '@cort/protocol';
import { randomBytes, randomInt } from 'node:crypto';

/** Anything we can push messages to; a WebSocket in production, a spy in tests. */
export interface Connection {
    send(message: ServerMessage): void;
}

interface Member {
    name: string;
    token: string;
    connection: Connection | null;
}

const SEATS: Seat[] = [0, 1, 2, 3];
/** The second person to arrive sits opposite the first, so two friends start as partners. */
const JOIN_ORDER: Seat[] = [0, 2, 1, 3];
const BOT_NAMES = ['Алим', 'Дильназ', 'Ильхам', 'Рамиля'];
const MAX_NAME = 16;
/**
 * How long a seat is held for someone who dropped out before the game began.
 * On a phone, switching to a messenger to send the invite link is enough to
 * drop the connection, so this has to cover writing a message.
 */
const SEAT_HOLD_MS = 3 * 60_000;

export interface RoomSettings {
    title?: string;
    /** Show the table in the public list. */
    open?: boolean;
}

export class RoomError extends Error {
    constructor(
        public code: ErrorCode,
        message: string,
    ) {
        super(message);
    }
}

/**
 * One table on the server. Holds the only copy of the full game state and
 * sends each player nothing but their own view of it.
 */
export class Room {
    private members: (Member | null)[] = [null, null, null, null];
    private host: Seat = 0;
    private runner: GameRunner | null = null;
    private holds = new Map<Seat, ReturnType<typeof setTimeout>>();

    private title: string;

    constructor(
        readonly code: string,
        private readonly settings: RoomSettings = {},
        private readonly delays?: Partial<RunnerDelays>,
    ) {
        this.title = (settings.title ?? '').trim().slice(0, MAX_TITLE);
    }

    /** The table as shown in the public list, or null if it should not be listed. */
    get summary(): RoomSummary | null {
        const people = this.members.filter((member) => member !== null).length;
        if (!this.settings.open || this.abandoned || people === 4) return null;
        return {
            code: this.code,
            title: this.title,
            host: this.members[this.host]?.name ?? '',
            players: people,
            started: this.started,
        };
    }

    get started(): boolean {
        return this.runner !== null;
    }

    /** True when nobody is connected, so the room can be discarded. */
    get abandoned(): boolean {
        return this.members.every((member) => !member?.connection);
    }

    /** Seats a player, or gives a returning player their seat back. */
    join(connection: Connection, rawName: string, token?: string): Seat {
        const name = rawName.trim().slice(0, MAX_NAME) || 'Игрок';
        let seat = token ? this.members.findIndex((member) => member?.token === token) : -1;

        if (seat >= 0) {
            this.members[seat]!.connection = connection;
            this.cancelHold(seat as Seat);
        } else {
            // In a running game a newcomer may take over a seat a bot is playing.
            seat = JOIN_ORDER.find((s) => this.members[s] === null) ?? -1;
            if (seat < 0) throw new RoomError('roomFull', 'В комнате нет свободных мест');
            if (this.abandoned) this.host = seat as Seat;
            if (!this.title) this.title = `Комната ${name}`.slice(0, MAX_TITLE);
            this.members[seat] = { name, token: randomBytes(12).toString('hex'), connection };
        }

        const member = this.members[seat]!;
        this.runner?.setBot(seat as Seat, false);
        connection.send({ type: 'joined', code: this.code, seat: seat as Seat, token: member.token });
        this.broadcastRoom();
        const state = this.runner?.state;
        if (state) connection.send({ type: 'update', view: viewFor(state, seat as Seat), events: [] });
        return seat as Seat;
    }

    /**
     * A player's connection dropped. Their seat is kept: in a game a bot covers
     * for them, and before the start the seat is held for a while so they can
     * come back to it.
     */
    leave(seat: Seat, connection: Connection): void {
        const member = this.members[seat];
        // An old connection closing after the player already came back on a new one.
        if (!member || member.connection !== connection) return;
        member.connection = null;
        if (this.started) {
            this.runner!.setBot(seat, true);
        } else {
            this.cancelHold(seat);
            this.holds.set(seat, setTimeout(() => this.release(seat), SEAT_HOLD_MS));
        }
        this.broadcastRoom();
    }

    /** The hold ran out: the seat is free again, and a host who never returned hands over. */
    private release(seat: Seat): void {
        this.holds.delete(seat);
        if (this.started || this.members[seat]?.connection) return;
        this.members[seat] = null;
        if (seat === this.host) {
            this.host = SEATS.find((s) => this.members[s]?.connection) ?? this.host;
        }
        this.broadcastRoom();
    }

    private cancelHold(seat: Seat): void {
        clearTimeout(this.holds.get(seat));
        this.holds.delete(seat);
    }

    handle(seat: Seat, message: ClientMessage): void {
        switch (message.type) {
            case 'start':
                if (seat !== this.host) throw new RoomError('notHost', 'Начать игру может только хозяин комнаты');
                if (!this.started) this.start();
                break;
            case 'action':
                this.act(seat, message.action);
                break;
            case 'rematch':
                if (this.runner?.state?.phase === 'matchOver') this.runner.start(randomInt(0x7fffffff));
                break;
            case 'emote':
                if (isReaction(message.emote)) {
                    this.broadcast({ type: 'emote', seat, emote: message.emote });
                }
                break;
            default:
                throw new RoomError('badMessage', 'Неизвестное сообщение');
        }
    }

    dispose(): void {
        this.runner?.dispose();
        SEATS.forEach((seat) => this.cancelHold(seat));
    }

    private start(): void {
        // Anyone still away keeps their seat; a bot plays it until they return.
        SEATS.forEach((seat) => this.cancelHold(seat));
        this.runner = new GameRunner({
            bots: this.members.map((member) => !member?.connection),
            delays: this.delays,
            onUpdate: (state, events) => {
                for (const seat of SEATS) {
                    this.members[seat]?.connection?.send({ type: 'update', view: viewFor(state, seat), events });
                }
            },
        });
        this.broadcastRoom();
        this.runner.start(randomInt(0x7fffffff));
    }

    private act(seat: Seat, action: Action): void {
        if (!this.runner) throw new RoomError('illegalAction', 'Игра ещё не началась');
        // Rebuild the action from validated parts; the seat is always the sender's own.
        let safe: Action;
        if (action?.type === 'chooseTrump' && SUITS.includes(action.suit)) {
            safe = { type: 'chooseTrump', seat, suit: action.suit };
        } else if (action?.type === 'playCard' && SUITS.includes(action.card?.suit) && RANKS.includes(action.card?.rank)) {
            safe = { type: 'playCard', seat, card: { suit: action.card.suit, rank: action.card.rank } };
        } else {
            throw new RoomError('badMessage', 'Недопустимый ход');
        }
        try {
            this.runner.act(safe);
        } catch (error) {
            if (error instanceof RuleError) throw new RoomError('illegalAction', RULE_MESSAGES[error.code]);
            throw error;
        }
    }

    private info(): RoomInfo {
        return {
            code: this.code,
            title: this.title,
            open: this.settings.open === true,
            host: this.host,
            started: this.started,
            seats: SEATS.map((seat) => {
                const member = this.members[seat];
                if (member) return { seat, name: member.name, kind: 'human', connected: member.connection !== null };
                return this.started
                    ? { seat, name: BOT_NAMES[seat], kind: 'bot', connected: true }
                    : { seat, name: '', kind: 'empty', connected: false };
            }),
        };
    }

    private broadcastRoom(): void {
        this.broadcast({ type: 'room', room: this.info() });
    }

    private broadcast(message: ServerMessage): void {
        this.members.forEach((member) => member?.connection?.send(message));
    }
}

const RULE_MESSAGES: Record<RuleError['code'], string> = {
    wrongPhase: 'Сейчас так сходить нельзя',
    notYourTurn: 'Сейчас не ваш ход',
    cardNotInHand: 'У вас нет такой карты',
    mustFollowSuit: 'Нужно ходить в масть',
};
