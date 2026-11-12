import { GameRunner, RANKS, RuleError, SUITS, viewFor, type Action, type RunnerDelays, type Seat } from '@cort/engine';
import { EMOTES, type ClientMessage, type ErrorCode, type RoomInfo, type ServerMessage } from '@cort/protocol';
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

    constructor(
        readonly code: string,
        private readonly delays?: Partial<RunnerDelays>,
    ) {}

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
        } else {
            // In a running game a newcomer may take over a seat a bot is playing.
            seat = JOIN_ORDER.find((s) => this.members[s] === null) ?? -1;
            if (seat < 0) throw new RoomError('roomFull', 'За столом нет свободных мест');
            if (this.abandoned) this.host = seat as Seat;
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

    /** A player's connection dropped. Before the start they lose the seat; in a game a bot covers for them. */
    leave(seat: Seat): void {
        const member = this.members[seat];
        if (!member) return;
        if (this.started) {
            member.connection = null;
            this.runner!.setBot(seat, true);
        } else {
            this.members[seat] = null;
        }
        if (seat === this.host) {
            this.host = SEATS.find((s) => this.members[s]?.connection) ?? this.host;
        }
        this.broadcastRoom();
    }

    handle(seat: Seat, message: ClientMessage): void {
        switch (message.type) {
            case 'start':
                if (seat !== this.host) throw new RoomError('notHost', 'Начать игру может только хозяин стола');
                if (!this.started) this.start();
                break;
            case 'action':
                this.act(seat, message.action);
                break;
            case 'rematch':
                if (this.runner?.state?.phase === 'matchOver') this.runner.start(randomInt(0x7fffffff));
                break;
            case 'emote':
                if ((EMOTES as readonly string[]).includes(message.emote)) {
                    this.broadcast({ type: 'emote', seat, emote: message.emote });
                }
                break;
            default:
                throw new RoomError('badMessage', 'Неизвестное сообщение');
        }
    }

    dispose(): void {
        this.runner?.dispose();
    }

    private start(): void {
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
