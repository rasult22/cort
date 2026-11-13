import {
    GameRunner,
    RANKS,
    RuleError,
    SUITS,
    viewFor,
    viewForSpectator,
    type Action,
    type GameEvent,
    type GameState,
    type RunnerDelays,
    type Seat,
} from '@cort/engine';
import {
    isReaction,
    MAX_NAME,
    MAX_SPECTATORS,
    MAX_TITLE,
    type ClientMessage,
    type ErrorCode,
    type MatchHand,
    type RoomInfo,
    type RoomSummary,
    type ServerMessage,
    type TurnTimer,
} from '@cort/protocol';
import { randomBytes, randomInt } from 'node:crypto';
import type { RoomSnapshot, SavedMatch } from './db/schema';
import type { MatchRecord } from './store';

/** Who a connection belongs to, once they have signed in. */
export interface Identity {
    userId: string;
    name: string;
    avatar: string | null;
}

/** Anything we can push messages to; a WebSocket in production, a spy in tests. */
export interface Connection {
    send(message: ServerMessage): void;
    /** Set for people who have signed in; guests have none. */
    user?: Identity | null;
}

interface Person {
    name: string;
    avatar: string | null;
    userId: string | null;
    deviceId: string | null;
}

interface Member extends Person {
    token: string;
    connection: Connection | null;
    /** Ran out of time on their last move. */
    idle: boolean;
}

interface Watcher extends Person {
    id: number;
    connection: Connection;
}

type Role = { seat: Seat } | { watcher: Watcher };

const SEATS: Seat[] = [0, 1, 2, 3];
/** The second person to arrive sits opposite the first, so two friends start as partners. */
const JOIN_ORDER: Seat[] = [0, 2, 1, 3];
const BOT_NAMES = ['Алим', 'Дильназ', 'Ильхам', 'Рамиля'];
/**
 * How long a seat is held for someone who dropped out before the game began.
 * On a phone, switching to a messenger to send the invite link is enough to
 * drop the connection, so this has to cover writing a message.
 */
const SEAT_HOLD_MS = 3 * 60_000;
/** Someone who let the clock run out gets only this long for their next moves, until they play one themselves. */
const IDLE_TURN_MS = 6000;
/** The least time between two reactions from one person. */
const EMOTE_GAP_MS = 350;
const MAX_DEVICE = 64;

export interface RoomSettings {
    title?: string;
    /** Show the table in the public list. */
    open?: boolean;
}

/** What a table needs from the outside world. Everything is optional: a bare table just plays. */
export interface RoomHooks {
    delays?: Partial<RunnerDelays>;
    /** How long a person may think about a move, in ms. Without it nobody is timed. */
    turnMs?: number;
    /** Something worth saving has changed. */
    onChange?: (room: Room) => void;
    /** A match was played to the end. */
    onMatch?: (record: MatchRecord) => void;
}

export interface EnterRequest {
    name?: unknown;
    token?: unknown;
    watch?: unknown;
    device?: unknown;
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
 * sends each player nothing but their own view of it; spectators get the
 * table without anyone's cards.
 */
export class Room {
    private members: (Member | null)[] = [null, null, null, null];
    private watchers: Watcher[] = [];
    private roles = new Map<Connection, Role>();
    private host: Seat = 0;
    private runner: GameRunner | null = null;
    private match: SavedMatch | null = null;
    private holds = new Map<Seat, ReturnType<typeof setTimeout>>();
    private lastEmote = new WeakMap<Connection, number>();
    private nextWatcherId = 1;

    private title: string;
    private readonly open: boolean;

    constructor(
        readonly code: string,
        settings: RoomSettings = {},
        private readonly hooks: RoomHooks = {},
    ) {
        this.title = (settings.title ?? '').trim().slice(0, MAX_TITLE);
        this.open = settings.open === true;
    }

    /** Brings back a table that was saved before a restart. Nobody is connected yet. */
    static revive(snapshot: RoomSnapshot, hooks: RoomHooks = {}): Room {
        const room = new Room(snapshot.code, { title: snapshot.title, open: snapshot.open }, hooks);
        room.host = snapshot.host as Seat;
        room.members = snapshot.members.map((member) => (member ? { ...member, connection: null } : null));
        room.match = snapshot.match;
        if (snapshot.game) {
            room.runner = room.createRunner();
            // Frozen until somebody returns: bots must not play the evening out on their own.
            room.runner.setPaused(true);
            room.runner.restore(snapshot.game);
        } else {
            SEATS.forEach((seat) => room.members[seat] && room.hold(seat));
        }
        return room;
    }

    /** Everything needed to carry on after a restart. */
    snapshot(): RoomSnapshot {
        return {
            code: this.code,
            title: this.title,
            open: this.open,
            host: this.host,
            members: this.members.map((member) => {
                if (!member) return null;
                const { connection: _connection, ...saved } = member;
                return saved;
            }),
            game: this.runner?.state ?? null,
            match: this.match,
        };
    }

    /** The table as shown in the public list, or null if it should not be listed. */
    get summary(): RoomSummary | null {
        // A table that is full and still gathering has nothing to offer a stranger.
        if (!this.open || this.abandoned || (this.people === 4 && !this.started)) return null;
        return this.describe();
    }

    /** The table as shown to someone who has its code. */
    describe(): RoomSummary {
        return {
            code: this.code,
            title: this.title,
            host: this.members[this.host]?.name ?? '',
            players: this.people,
            started: this.started,
            spectators: this.watchers.length,
        };
    }

    get started(): boolean {
        return this.runner !== null;
    }

    /** True when no player is connected, so the room can be discarded. */
    get abandoned(): boolean {
        return this.members.every((member) => !member?.connection);
    }

    private get people(): number {
        return this.members.filter((member) => member !== null).length;
    }

    /** Seats a player, gives a returning player their seat back, or lets someone in to watch. */
    enter(connection: Connection, request: EnterRequest): void {
        const user = connection.user ?? null;
        const token = typeof request.token === 'string' ? request.token : '';
        let seat = token ? this.members.findIndex((member) => member?.token === token) : -1;
        // An account keeps its seat wherever it comes from.
        if (seat < 0 && user) seat = this.members.findIndex((member) => member?.userId === user.userId);

        if (seat >= 0) {
            const member = this.members[seat]!;
            if (member.connection && member.connection !== connection) this.replace(member.connection);
            member.connection = connection;
            if (user) Object.assign(member, { name: user.name, avatar: user.avatar });
            this.cancelHold(seat as Seat);
            this.seat(connection, seat as Seat);
            return;
        }

        const person = describePerson(connection, request);
        if (request.watch === true) {
            this.watch(connection, person);
            return;
        }

        // In a running game a newcomer may take over a seat a bot is playing.
        seat = JOIN_ORDER.find((s) => this.members[s] === null) ?? -1;
        if (seat < 0) throw new RoomError('roomFull', 'В комнате нет свободных мест');
        if (this.abandoned) this.host = seat as Seat;
        if (!this.title) this.title = `Комната ${person.name}`.slice(0, MAX_TITLE);
        this.members[seat] = { ...person, token: newToken(), connection, idle: false };
        this.seat(connection, seat as Seat);
    }

    /** The connection now plays `seat`: tell them, and everyone else. */
    private seat(connection: Connection, seat: Seat): void {
        const member = this.members[seat]!;
        this.roles.set(connection, { seat });
        this.runner?.setBot(seat, false);
        this.runner?.setPaused(false);
        connection.send({ type: 'joined', code: this.code, seat, token: member.token });
        this.broadcastRoom();
        this.broadcastGame();
        this.changed();
    }

    private watch(connection: Connection, person: Person): void {
        if (!connection.user) throw new RoomError('authRequired', 'Смотреть чужую игру можно после входа');
        if (this.watchers.length >= MAX_SPECTATORS) throw new RoomError('roomFull', 'За этим столом уже слишком много зрителей');
        const watcher: Watcher = { ...person, id: this.nextWatcherId++, connection };
        this.watchers.push(watcher);
        this.roles.set(connection, { watcher });
        connection.send({ type: 'joined', code: this.code, seat: null, token: '', spectator: watcher.id });
        this.broadcastRoom();
        const state = this.runner?.state;
        if (state) connection.send({ type: 'update', view: viewForSpectator(state), events: [], timer: this.timer() });
    }

    /** The same account came in from somewhere else: the old window lets go. */
    private replace(old: Connection): void {
        this.roles.delete(old);
        old.send({ type: 'error', code: 'replaced', message: 'Вы вошли в эту комнату в другом окне' });
    }

    /**
     * A connection dropped. A player's seat is kept: in a game a bot covers
     * for them, and before the start the seat is held for a while so they can
     * come back to it. A spectator simply leaves.
     */
    leave(connection: Connection): void {
        const role = this.roles.get(connection);
        // An old connection closing after the person already came back on a new one.
        if (!role) return;
        this.roles.delete(connection);

        if ('watcher' in role) {
            this.watchers = this.watchers.filter((watcher) => watcher !== role.watcher);
            this.broadcastRoom();
            return;
        }

        const member = this.members[role.seat];
        if (!member || member.connection !== connection) return;
        member.connection = null;
        if (this.runner) {
            this.runner.setBot(role.seat, true);
            if (this.abandoned) this.runner.setPaused(true);
        } else {
            this.hold(role.seat);
        }
        this.broadcastRoom();
        this.broadcastGame();
        this.changed();
    }

    private hold(seat: Seat): void {
        this.cancelHold(seat);
        this.holds.set(
            seat,
            setTimeout(() => this.release(seat), SEAT_HOLD_MS),
        );
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
        this.changed();
    }

    private cancelHold(seat: Seat): void {
        clearTimeout(this.holds.get(seat));
        this.holds.delete(seat);
    }

    handle(connection: Connection, message: ClientMessage): void {
        const role = this.roles.get(connection);
        if (!role) throw new RoomError('notInRoom', 'Сначала войдите в комнату');

        if (message.type === 'emote') {
            this.emote(connection, role, message.emote);
            return;
        }
        if (message.type === 'sit') {
            this.sit(connection, role, message.seat);
            return;
        }
        if ('watcher' in role) throw new RoomError('illegalAction', 'Зрители не участвуют в игре');

        switch (message.type) {
            case 'start':
                if (role.seat !== this.host) throw new RoomError('notHost', 'Начать игру может только хозяин комнаты');
                if (!this.started) this.start();
                break;
            case 'action':
                this.act(role.seat, message.action);
                break;
            case 'rematch':
                if (this.runner?.state?.phase === 'matchOver') this.deal();
                break;
            default:
                throw new RoomError('badMessage', 'Неизвестное сообщение');
        }
    }

    /** Stops the table for good; anyone still watching is told it is over. */
    dispose(): void {
        this.runner?.dispose();
        SEATS.forEach((seat) => this.cancelHold(seat));
        const gone: ServerMessage = { type: 'error', code: 'roomNotFound', message: 'Комната закрыта' };
        this.watchers.forEach((watcher) => watcher.connection.send(gone));
    }

    /** Stops the timers but tells nobody: the process is going down and the table will be revived. */
    freeze(): void {
        this.runner?.dispose();
        SEATS.forEach((seat) => this.cancelHold(seat));
    }

    private emote(connection: Connection, role: Role, emote: unknown): void {
        if (!isReaction(emote)) return;
        const now = Date.now();
        if (now - (this.lastEmote.get(connection) ?? 0) < EMOTE_GAP_MS) return;
        this.lastEmote.set(connection, now);
        this.broadcast('watcher' in role ? { type: 'emote', seat: null, spectator: role.watcher.id, emote } : { type: 'emote', seat: role.seat, emote });
    }

    /**
     * Before the start a player may move to any free seat. A spectator may sit
     * down at any time: on an empty seat, or in place of a bot once the game is on.
     */
    private sit(connection: Connection, role: Role, target: unknown): void {
        if (!SEATS.includes(target as Seat)) throw new RoomError('badMessage', 'Такого места нет');
        const seat = target as Seat;
        if (this.members[seat]) throw new RoomError('seatTaken', 'Это место уже занято');

        if ('watcher' in role) {
            const { id: _id, connection: _connection, ...person } = role.watcher;
            this.watchers = this.watchers.filter((watcher) => watcher !== role.watcher);
            if (this.abandoned) this.host = seat;
            this.members[seat] = { ...person, token: newToken(), connection, idle: false };
            this.seat(connection, seat);
            return;
        }

        if (this.started) throw new RoomError('illegalAction', 'Пересесть можно только до начала игры');
        this.members[seat] = this.members[role.seat];
        this.members[role.seat] = null;
        if (this.host === role.seat) this.host = seat;
        this.seat(connection, seat);
    }

    private start(): void {
        // Anyone still away keeps their seat; a bot plays it until they return.
        SEATS.forEach((seat) => this.cancelHold(seat));
        this.runner = this.createRunner();
        this.broadcastRoom();
        this.deal();
    }

    /** A fresh match: the first one, or a rematch. */
    private deal(): void {
        const seed = randomInt(0x7fffffff);
        this.match = { startedAt: Date.now(), seed, hands: [], actions: [] };
        this.runner!.start(seed);
    }

    private createRunner(): GameRunner {
        const { turnMs } = this.hooks;
        return new GameRunner({
            bots: this.members.map((member) => !member?.connection),
            delays: this.hooks.delays,
            turnLimit: turnMs ? (seat) => (this.members[seat]?.idle ? Math.min(IDLE_TURN_MS, turnMs) : turnMs) : undefined,
            onTimeout: (seat) => this.setIdle(seat, true),
            onAction: (action) => this.match?.actions.push(encodeAction(action)),
            onUpdate: (state, events) => {
                this.keepScore(state, events);
                this.broadcastGame(events);
                this.changed();
            },
        });
    }

    private setIdle(seat: Seat, idle: boolean): void {
        const member = this.members[seat];
        if (!member || member.idle === idle) return;
        member.idle = idle;
        this.broadcastRoom();
    }

    /** Follows the match hand by hand, and hands the whole record over once it is won. */
    private keepScore(state: GameState, events: GameEvent[]): void {
        const match = this.match;
        if (!match) return;
        for (const event of events) {
            const hand = match.hands[match.hands.length - 1];
            if (event.type === 'handDealt') {
                match.hands.push({ caller: event.caller, trump: null, tricks: [0, 0], winner: null });
            } else if (event.type === 'trumpChosen' && hand) {
                hand.trump = event.suit;
            } else if (event.type === 'handWon' && hand) {
                hand.tricks = event.tricksWon;
                hand.winner = event.team;
            } else if (event.type === 'matchWon') {
                this.match = null;
                // A match the bots finished among themselves is nobody's history.
                if (this.people === 0) continue;
                this.hooks.onMatch?.({
                    roomCode: this.code,
                    startedAt: match.startedAt,
                    endedAt: Date.now(),
                    seed: match.seed,
                    rules: state.rules,
                    score: event.matchScore,
                    winner: event.team,
                    hands: match.hands.filter((h): h is MatchHand => h.winner !== null),
                    actions: match.actions,
                    players: SEATS.map((seat) => {
                        const member = this.members[seat];
                        return member
                            ? { seat, kind: 'human', userId: member.userId, deviceId: member.deviceId, name: member.name, avatar: member.avatar }
                            : { seat, kind: 'bot', userId: null, deviceId: null, name: BOT_NAMES[seat], avatar: null };
                    }),
                });
            }
        }
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
            // Their own move: they are back at the table.
            this.runner.act(safe);
            this.setIdle(seat, false);
        } catch (error) {
            if (error instanceof RuleError) throw new RoomError('illegalAction', RULE_MESSAGES[error.code]);
            throw error;
        }
    }

    private timer(): TurnTimer | null {
        const deadline = this.runner?.deadline;
        return deadline ? { seat: deadline.seat, left: Math.max(0, deadline.at - Date.now()), total: deadline.total } : null;
    }

    private info(): RoomInfo {
        return {
            code: this.code,
            title: this.title,
            open: this.open,
            host: this.host,
            started: this.started,
            seats: SEATS.map((seat) => {
                const member = this.members[seat];
                if (member) {
                    return {
                        seat,
                        name: member.name,
                        kind: 'human',
                        connected: member.connection !== null,
                        avatar: member.avatar,
                        member: member.userId !== null,
                        idle: member.idle,
                    };
                }
                return this.started
                    ? { seat, name: BOT_NAMES[seat], kind: 'bot', connected: true }
                    : { seat, name: '', kind: 'empty', connected: false };
            }),
            spectators: this.watchers.map(({ id, name, avatar }) => ({ id, name, avatar })),
        };
    }

    private broadcastRoom(): void {
        this.broadcast({ type: 'room', room: this.info() });
    }

    /** Sends everyone the game as they are allowed to see it. */
    private broadcastGame(events: GameEvent[] = []): void {
        const state = this.runner?.state;
        if (!state) return;
        const timer = this.timer();
        for (const seat of SEATS) {
            this.members[seat]?.connection?.send({ type: 'update', view: viewFor(state, seat), events, timer });
        }
        if (this.watchers.length === 0) return;
        const update: ServerMessage = { type: 'update', view: viewForSpectator(state), events, timer };
        this.watchers.forEach((watcher) => watcher.connection.send(update));
    }

    private broadcast(message: ServerMessage): void {
        this.members.forEach((member) => member?.connection?.send(message));
        this.watchers.forEach((watcher) => watcher.connection.send(message));
    }

    private changed(): void {
        this.hooks.onChange?.(this);
    }
}

const newToken = (): string => randomBytes(12).toString('hex');

/** Who is behind a connection: an account if they signed in, otherwise the name they typed. */
function describePerson(connection: Connection, request: EnterRequest): Person {
    const user = connection.user;
    if (user) return { name: user.name, avatar: user.avatar, userId: user.userId, deviceId: null };
    const name = String(request.name ?? '').trim().slice(0, MAX_NAME) || 'Игрок';
    const device = typeof request.device === 'string' && /^[\w-]{8,}$/.test(request.device) ? request.device.slice(0, MAX_DEVICE) : null;
    return { name, avatar: null, userId: null, deviceId: device };
}

/** One action in a few characters: "th" names hearts trump, "10s" plays the ten of spades, "n" deals the next hand. */
function encodeAction(action: Action): string {
    switch (action.type) {
        case 'chooseTrump':
            return `t${action.suit[0]}`;
        case 'playCard':
            return `${action.card.rank}${action.card.suit[0]}`;
        case 'nextHand':
            return 'n';
    }
}

const RULE_MESSAGES: Record<RuleError['code'], string> = {
    wrongPhase: 'Сейчас так сходить нельзя',
    notYourTurn: 'Сейчас не ваш ход',
    cardNotInHand: 'У вас нет такой карты',
    mustFollowSuit: 'Нужно ходить в масть',
};
