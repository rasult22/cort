import { legalCards, type PlayerView, type Seat } from '@cort/engine';
import type { ClientMessage, RoomInfo, ServerMessage } from '@cort/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomSnapshot } from './db/schema';
import { Lobby, type LobbyOptions } from './lobby';
import type { Connection, Identity } from './room';
import type { MatchRecord } from './store';

/** A fake client: records everything the server sends it. */
class Client implements Connection {
    messages: ServerMessage[] = [];

    /** `user` is set for someone who has signed in; a guest has none. */
    constructor(
        private lobby: Lobby,
        public user: Identity | null = null,
    ) {}

    send(message: ServerMessage): void {
        this.messages.push(structuredClone(message));
    }

    say(message: ClientMessage): void {
        this.lobby.receive(this, JSON.stringify(message));
    }

    last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> {
        const found = this.messages.filter((m) => m.type === type).at(-1);
        if (!found) throw new Error(`No "${type}" message received`);
        return found as Extract<ServerMessage, { type: T }>;
    }

    get seat(): Seat {
        const seat = this.last('joined').seat;
        if (seat === null) throw new Error('Only watching: no seat');
        return seat;
    }

    get room(): RoomInfo {
        return this.last('room').room;
    }

    get view(): PlayerView {
        return this.last('update').view;
    }

    get errors(): string[] {
        return this.messages.flatMap((m) => (m.type === 'error' ? [m.code] : []));
    }
}

describe('online tables', () => {
    let lobby: Lobby;
    const client = () => new Client(lobby);
    /** Someone who has signed in. */
    const member = (name: string) => new Client(lobby, { userId: `user-${name}`, name, avatar: null });

    /** Two friends at one table, game started; the other two seats are bots. */
    function startedTable() {
        const host = client();
        const guest = client();
        host.say({ type: 'create', name: 'Расул' });
        guest.say({ type: 'join', code: host.room.code, name: 'Алия' });
        host.say({ type: 'start' });
        return { host, guest };
    }

    /** Makes `player` do whatever is legal, if it is their move. */
    function moveIfDue(player: Client): void {
        const view = player.view;
        if (view.phase === 'choosingTrump' && view.caller === player.seat) {
            player.say({ type: 'action', action: { type: 'chooseTrump', seat: player.seat, suit: 'hearts' } });
        } else if (view.phase === 'playing' && view.turn === player.seat) {
            const card = legalCards(view.hand, view.trick)[0];
            player.say({ type: 'action', action: { type: 'playCard', seat: player.seat, card } });
        }
    }

    beforeEach(() => {
        vi.useFakeTimers();
        lobby = new Lobby();
    });
    afterEach(() => vi.useRealTimers());

    it('creates a table and seats friends who join by its code', () => {
        const host = client();
        host.say({ type: 'create', name: 'Расул' });
        expect(host.room.code).toMatch(/^[A-Z]{4}$/);

        const guest = client();
        guest.say({ type: 'join', code: host.room.code.toLowerCase(), name: '  Алия  ' });

        // The second player sits opposite the first: friends start as partners.
        expect([host.seat, guest.seat]).toEqual([0, 2]);
        expect(host.room.seats.map((s) => s.kind)).toEqual(['human', 'empty', 'human', 'empty']);
        expect(host.room.seats[guest.seat].name).toBe('Алия');
        expect(host.room.started).toBe(false);
    });

    it('reports unknown tables and full tables', () => {
        const lost = client();
        lost.say({ type: 'join', code: 'ZZZZ', name: 'Кто-то' });
        expect(lost.errors).toEqual(['roomNotFound']);

        const host = client();
        host.say({ type: 'create', name: 'Хозяин' });
        for (let i = 0; i < 3; i++) client().say({ type: 'join', code: host.room.code, name: `Гость ${i}` });
        const fifth = client();
        fifth.say({ type: 'join', code: host.room.code, name: 'Пятый' });
        expect(fifth.errors).toEqual(['roomFull']);
    });

    it('lets only the host start, and fills empty seats with bots', () => {
        const host = client();
        const guest = client();
        host.say({ type: 'create', name: 'Расул' });
        guest.say({ type: 'join', code: host.room.code, name: 'Алия' });

        guest.say({ type: 'start' });
        expect(guest.errors).toEqual(['notHost']);
        expect(host.room.started).toBe(false);

        host.say({ type: 'start' });
        expect(host.room.started).toBe(true);
        expect(host.room.seats.map((s) => s.kind)).toEqual(['human', 'bot', 'human', 'bot']);
    });

    it('sends each player their own cards and nobody else’s', () => {
        const { host, guest } = startedTable();
        for (const player of [host, guest]) {
            const update = player.last('update');
            expect(update.view.seat).toBe(player.seat);
            expect(update.view.hand).toHaveLength(5);
            expect(update.view).not.toHaveProperty('hands');
            expect(update.view).not.toHaveProperty('stock');
            expect(JSON.stringify(update)).not.toContain('"rng"');
        }
        expect(host.view.hand).not.toEqual(guest.view.hand);
    });

    it('ignores the seat a client claims and plays for the sender', () => {
        const { host, guest } = startedTable();
        // Whoever is NOT the caller tries to name trump on the caller's behalf.
        const caller = host.view.caller;
        const cheat = host.seat === caller ? guest : host;
        cheat.say({ type: 'action', action: { type: 'chooseTrump', seat: caller, suit: 'spades' } });
        expect(cheat.errors).toEqual(['illegalAction']);
        expect(host.view.trump).toBeNull();
    });

    it('rejects malformed messages without breaking the table', () => {
        const { host } = startedTable();
        lobby.receive(host, 'not json');
        lobby.receive(host, JSON.stringify({ type: 'action', action: { type: 'playCard', card: { suit: 'stars', rank: '99' } } }));
        lobby.receive(host, JSON.stringify({ type: 'nonsense' }));
        expect(host.errors).toEqual(['badMessage', 'badMessage', 'badMessage']);
        expect(host.view.phase).toBe('choosingTrump');
    });

    it('plays a whole hand with two people and two bots', () => {
        const { host, guest } = startedTable();
        for (let guard = 0; host.view.phase !== 'handOver' && host.view.phase !== 'matchOver'; guard++) {
            if (guard > 300) throw new Error('Hand did not finish');
            moveIfDue(host);
            moveIfDue(guest);
            vi.runOnlyPendingTimers();
        }
        expect(host.view.handWinner).not.toBeNull();
        expect(guest.view.matchScore).toEqual(host.view.matchScore);
        expect(host.errors).toEqual([]);
        expect(guest.errors).toEqual([]);
    });

    it('lets a bot cover for a player who drops, and gives the seat back on return', () => {
        const { host, guest } = startedTable();
        const { token } = guest.last('joined');
        const seat = guest.seat;
        lobby.disconnect(guest);
        expect(host.room.seats[seat]).toMatchObject({ kind: 'human', connected: false });

        // The game goes on without them.
        for (let i = 0; i < 40; i++) {
            moveIfDue(host);
            vi.runOnlyPendingTimers();
        }
        expect(host.view.phase).not.toBe('choosingTrump');

        const back = client();
        back.say({ type: 'join', code: host.room.code, name: 'Алия', token });
        expect(back.seat).toBe(seat);
        expect(host.room.seats[seat].connected).toBe(true);
        expect(back.view.seat).toBe(seat);
        expect(back.view.handNumber).toBe(host.view.handNumber);
    });

    it('keeps the table when its creator switches apps to send the link, and gives the seat back', () => {
        const host = member('Расул');
        host.say({ type: 'create', name: 'Расул', open: true });
        const { code, token } = host.last('joined');
        const seat = host.seat;

        // The phone drops the connection the moment the browser goes to the background.
        lobby.disconnect(host);
        vi.advanceTimersByTime(2 * 60_000);
        expect(lobby.roomCount).toBe(1);
        // An empty table is not advertised to strangers meanwhile.
        expect(lobby.openRooms()).toEqual([]);

        const back = client();
        back.say({ type: 'join', code, name: 'Расул', token });
        expect(back.errors).toEqual([]);
        expect(back.seat).toBe(seat);
        expect(back.room.host).toBe(seat);
        expect(back.room.seats[seat]).toMatchObject({ kind: 'human', connected: true });

        // Coming back cancels the countdown: the table does not vanish later.
        vi.advanceTimersByTime(60 * 60_000);
        expect(lobby.roomCount).toBe(1);
    });

    it('holds a seat for a while before the start, then frees it', () => {
        const host = client();
        const guest = client();
        host.say({ type: 'create', name: 'Расул' });
        guest.say({ type: 'join', code: host.room.code, name: 'Алия' });

        lobby.disconnect(guest);
        expect(host.room.seats[guest.seat]).toMatchObject({ kind: 'human', connected: false });

        vi.advanceTimersByTime(3 * 60_000);
        expect(host.room.seats.map((s) => s.kind)).toEqual(['human', 'empty', 'empty', 'empty']);
    });

    it('hands the table to someone else if the host never comes back', () => {
        const host = client();
        const guest = client();
        host.say({ type: 'create', name: 'Расул' });
        guest.say({ type: 'join', code: host.room.code, name: 'Алия' });

        lobby.disconnect(host);
        expect(guest.room.host).toBe(host.seat);
        vi.advanceTimersByTime(3 * 60_000);
        expect(guest.room.host).toBe(guest.seat);
        guest.say({ type: 'start' });
        expect(guest.room.started).toBe(true);
    });

    it('is not fooled when an old connection closes after the player has already returned', () => {
        const host = client();
        host.say({ type: 'create', name: 'Расул' });
        const { code, token } = host.last('joined');
        const seat = host.seat;

        // The new connection arrives before the server notices the old one is dead.
        const back = client();
        back.say({ type: 'join', code, name: 'Расул', token });
        lobby.disconnect(host);

        expect(back.room.seats[seat].connected).toBe(true);
        vi.advanceTimersByTime(60 * 60_000);
        expect(lobby.roomCount).toBe(1);
    });

    it('forgets a table that everyone has left for good', () => {
        const host = client();
        host.say({ type: 'create', name: 'Расул' });
        lobby.disconnect(host);
        vi.advanceTimersByTime(10 * 60_000);
        expect(lobby.roomCount).toBe(0);
    });

    it('lists open tables for anyone to join, and keeps private ones out of the list', () => {
        const open = member('Расул');
        open.say({ type: 'create', name: 'Расул', title: '  Вечерний корт  ', open: true });
        const secret = client();
        secret.say({ type: 'create', name: 'Алия' });

        expect(lobby.openRooms()).toEqual([
            { code: open.room.code, title: 'Вечерний корт', host: 'Расул', players: 1, started: false, spectators: 0 },
        ]);
        expect(open.room).toMatchObject({ title: 'Вечерний корт', open: true });
        // A table without a name is called after its host.
        expect(secret.room).toMatchObject({ title: 'Комната Алия', open: false });

        // A stranger picks it from the list and sits down.
        const stranger = client();
        stranger.say({ type: 'join', code: lobby.openRooms()[0].code, name: 'Тимур' });
        expect(lobby.openRooms()[0].players).toBe(2);
    });

    it('drops a table from the list once it is full or empty', () => {
        const host = member('Расул');
        host.say({ type: 'create', name: 'Расул', open: true });
        const guests = [client(), client(), client()];
        guests.forEach((guest, i) => guest.say({ type: 'join', code: host.room.code, name: `Гость ${i}` }));
        expect(lobby.openRooms()).toEqual([]);

        // Someone drops out: their seat is held first, then freed, and the table is listed again.
        lobby.disconnect(guests[0]);
        expect(lobby.openRooms()).toEqual([]);
        vi.advanceTimersByTime(3 * 60_000);
        expect(lobby.openRooms()).toHaveLength(1);

        [host, guests[1], guests[2]].forEach((player) => lobby.disconnect(player));
        expect(lobby.openRooms()).toEqual([]);
    });

    it('keeps a running open table listed while a bot holds a seat', () => {
        const host = member('Расул');
        host.say({ type: 'create', name: 'Расул', open: true });
        host.say({ type: 'start' });
        expect(lobby.openRooms()).toMatchObject([{ started: true, players: 1 }]);

        const late = client();
        late.say({ type: 'join', code: host.room.code, name: 'Опоздавший' });
        expect(late.view.seat).toBe(late.seat);
        expect(host.room.seats[late.seat]).toMatchObject({ kind: 'human', name: 'Опоздавший' });
    });

    it('passes emotes around the table, but only known ones', () => {
        const { host, guest } = startedTable();
        vi.setSystemTime(1_000_000);
        guest.say({ type: 'emote', emote: '🔥' });
        expect(host.last('emote')).toEqual({ type: 'emote', seat: guest.seat, emote: '🔥' });
        vi.setSystemTime(1_001_000);
        guest.say({ type: 'emote', emote: 'trump' });
        expect(host.last('emote')).toEqual({ type: 'emote', seat: guest.seat, emote: 'trump' });
        vi.setSystemTime(1_002_000);
        guest.say({ type: 'emote', emote: 'meme:49' });
        expect(host.last('emote')).toEqual({ type: 'emote', seat: guest.seat, emote: 'meme:49' });
        // A burst from one person is thinned out.
        guest.say({ type: 'emote', emote: '👍' });
        expect(host.last('emote').emote).toBe('meme:49');
        vi.setSystemTime(1_003_000);

        const before = host.messages.length;
        guest.say({ type: 'emote', emote: '<script>' });
        guest.say({ type: 'emote', emote: 'meme:50' });
        guest.say({ type: 'emote', emote: 'meme:../../secret' });
        expect(host.messages.length).toBe(before);
    });

it('lets a player choose a seat before the start, and the host stays the host', () => {
        const host = client();
        const guest = client();
        host.say({ type: 'create', name: 'Расул' });
        guest.say({ type: 'join', code: host.room.code, name: 'Алия' });
        expect([host.seat, guest.seat]).toEqual([0, 2]);

        // The guest would rather play against the host than with them.
        guest.say({ type: 'sit', seat: 1 });
        expect(guest.seat).toBe(1);
        expect(host.room.seats.map((s) => s.kind)).toEqual(['human', 'human', 'empty', 'empty']);

        // A taken seat stays taken.
        guest.say({ type: 'sit', seat: 0 });
        expect(guest.errors).toEqual(['seatTaken']);

        host.say({ type: 'sit', seat: 3 });
        expect(host.seat).toBe(3);
        expect(guest.room.host).toBe(3);
        host.say({ type: 'start' });
        expect(host.view.seat).toBe(3);
        expect(guest.view.seat).toBe(1);

        // Once the cards are dealt, everyone stays where they are.
        guest.say({ type: 'sit', seat: 2 });
        expect(guest.errors).toEqual(['seatTaken', 'illegalAction']);
    });

    describe('with a clock on every move', () => {
        const TURN = 30_000;
        beforeEach(() => {
            lobby = new Lobby({ turnMs: TURN });
        });

        /** Lets the bots play until it is a person's move (or the hand is over). */
        function untilSomeoneMustMove(player: Client): Seat | null {
            for (let guard = 0; guard < 400; guard++) {
                const timer = player.last('update').timer;
                if (timer) return timer.seat;
                if (player.view.phase === 'matchOver') return null;
                vi.advanceTimersToNextTimer();
            }
            throw new Error('Nobody was ever asked to move');
        }

        it('tells everyone whose move is being timed and how long is left', () => {
            const { host, guest } = startedTable();
            const seat = untilSomeoneMustMove(host);
            expect(host.last('update').timer).toEqual({ seat, left: TURN, total: TURN });
            expect(guest.last('update').timer).toEqual({ seat, left: TURN, total: TURN });

            // Someone joining halfway through the move sees the time that is really left.
            vi.advanceTimersByTime(12_000);
            const late = client();
            late.say({ type: 'join', code: host.room.code, name: 'Опоздавший' });
            expect(late.last('update').timer).toEqual({ seat, left: TURN - 12_000, total: TURN });
            // …and their arrival does not restart the clock for the one who is thinking.
            expect(host.last('update').timer).toEqual({ seat, left: TURN - 12_000, total: TURN });
        });

        it('moves for a player who runs out of time, and keeps them on a short clock until they play', () => {
            const { host, guest } = startedTable();
            const seat = untilSomeoneMustMove(host)!;
            const sleeper = host.seat === seat ? host : guest;
            const before = JSON.stringify(sleeper.view);

            vi.advanceTimersByTime(TURN - 1);
            expect(JSON.stringify(sleeper.view)).toBe(before);
            vi.advanceTimersByTime(1);
            expect(JSON.stringify(sleeper.view)).not.toBe(before);
            expect(host.room.seats[seat]).toMatchObject({ kind: 'human', connected: true, idle: true });

            // Their next move gets only a few seconds, so one sleeper does not stall the table.
            const awake = sleeper === host ? guest : host;
            for (let guard = 0; guard < 400 && sleeper.last('update').timer?.seat !== seat; guard++) {
                if (sleeper.view.phase === 'matchOver') return;
                moveIfDue(awake);
                if (sleeper.last('update').timer?.seat !== seat) vi.advanceTimersToNextTimer();
            }
            expect(sleeper.last('update').timer?.total).toBeLessThan(TURN);

            // Playing a card themselves puts them back on the normal clock.
            moveIfDue(sleeper);
            expect(sleeper.errors).toEqual([]);
            expect(host.room.seats[seat].idle).toBe(false);
        });
    });

    it('freezes a running game while nobody is connected, and carries on when someone returns', () => {
        const { host, guest } = startedTable();
        const { token } = host.last('joined');
        lobby.disconnect(host);
        lobby.disconnect(guest);
        const frozen = JSON.stringify(host.view);

        // Left alone, the bots would play the whole evening out. They do not.
        const back = client();
        vi.advanceTimersByTime(5 * 60_000);
        back.say({ type: 'join', code: host.room.code, name: 'Расул', token });
        const { seat: _seat, hand: _hand, ...returned } = back.view;
        expect(JSON.parse(frozen)).toMatchObject(returned);

        for (let i = 0; i < 40; i++) {
            moveIfDue(back);
            vi.runOnlyPendingTimers();
        }
        expect(back.view.phase).not.toBe('choosingTrump');
    });

    describe('spectators', () => {
        it('lets a signed-in person watch, and never sends them anyone’s cards', () => {
            const { host, guest } = startedTable();
            const watcher = member('Тимур');
            watcher.say({ type: 'join', code: host.room.code, name: 'Тимур', watch: true });

            expect(watcher.last('joined')).toMatchObject({ seat: null, spectator: 1 });
            expect(host.room.spectators).toEqual([{ id: 1, name: 'Тимур', avatar: null }]);
            // Watching does not take a seat.
            expect(host.room.seats.map((s) => s.kind)).toEqual(['human', 'bot', 'human', 'bot']);

            for (let i = 0; i < 60; i++) {
                moveIfDue(host);
                moveIfDue(guest);
                vi.runOnlyPendingTimers();
            }
            const updates = watcher.messages.filter((m) => m.type === 'update');
            expect(updates.length).toBeGreaterThan(10);
            for (const update of updates) {
                expect(update.view.hand).toEqual([]);
                expect(update.view).not.toHaveProperty('hands');
                expect(update.view).not.toHaveProperty('stock');
            }
            // They do see the table itself: the score and how many cards each player holds.
            expect(watcher.view.tricksWon).toEqual(host.view.tricksWon);
            expect(watcher.view.handSizes).toEqual(host.view.handSizes);
        });

        it('keeps guests out of the stands, and spectators out of the game', () => {
            const { host } = startedTable();
            const guest = client();
            guest.say({ type: 'join', code: host.room.code, name: 'Гость', watch: true });
            expect(guest.errors).toEqual(['authRequired']);

            const watcher = member('Тимур');
            watcher.say({ type: 'join', code: host.room.code, name: 'Тимур', watch: true });
            watcher.say({ type: 'start' });
            watcher.say({ type: 'action', action: { type: 'chooseTrump', seat: host.view.caller, suit: 'spades' } });
            watcher.say({ type: 'rematch' });
            expect(watcher.errors).toEqual(['illegalAction', 'illegalAction', 'illegalAction']);
            expect(host.view.trump).toBeNull();
        });

        it('shows the table who reacted from the stands', () => {
            const { host } = startedTable();
            const watcher = member('Тимур');
            watcher.say({ type: 'join', code: host.room.code, name: 'Тимур', watch: true });
            watcher.say({ type: 'emote', emote: '🔥' });
            expect(host.last('emote')).toEqual({ type: 'emote', seat: null, spectator: 1, emote: '🔥' });
        });

        it('lets a spectator sit down in place of a bot', () => {
            const { host } = startedTable();
            const watcher = member('Тимур');
            watcher.say({ type: 'join', code: host.room.code, name: 'Тимур', watch: true });
            expect(watcher.view.hand).toEqual([]);

            watcher.say({ type: 'sit', seat: host.seat });
            expect(watcher.errors).toEqual(['seatTaken']);

            watcher.say({ type: 'sit', seat: 1 });
            expect(watcher.seat).toBe(1);
            expect(watcher.last('joined').token).not.toBe('');
            expect(host.room.seats[1]).toMatchObject({ kind: 'human', name: 'Тимур', member: true });
            expect(host.room.spectators).toEqual([]);
            // Now a player, they get their own cards.
            expect(watcher.view.seat).toBe(1);
            expect(watcher.view.hand.length).toBeGreaterThan(0);
        });

        it('lists a full open table that is playing, so people can come and watch', () => {
            const host = member('Расул');
            host.say({ type: 'create', name: 'Расул', open: true });
            for (let i = 0; i < 3; i++) client().say({ type: 'join', code: host.room.code, name: `Гость ${i}` });
            expect(lobby.openRooms()).toEqual([]);

            host.say({ type: 'start' });
            const watcher = member('Тимур');
            watcher.say({ type: 'join', code: lobby.openRooms()[0].code, name: 'Тимур', watch: true });
            expect(lobby.openRooms()).toMatchObject([{ players: 4, started: true, spectators: 1 }]);

            lobby.disconnect(watcher);
            expect(host.room.spectators).toEqual([]);
            expect(lobby.describe(host.room.code.toLowerCase())).toMatchObject({ players: 4, spectators: 0 });
        });
    });

    describe('accounts and guests', () => {
        it('only lets signed-in people open a table to the public', () => {
            const guest = client();
            guest.say({ type: 'create', name: 'Гость', open: true });
            expect(guest.errors).toEqual(['authRequired']);
            expect(lobby.roomCount).toBe(0);

            // By link or code a guest plays as before.
            guest.say({ type: 'create', name: 'Гость' });
            expect(guest.room).toMatchObject({ open: false, title: 'Комната Гость' });
        });

        it('seats a signed-in person under their account name and picture, whatever the client says', () => {
            const user = new Client(lobby, { userId: 'u1', name: 'Расул', avatar: 'preset:3' });
            user.say({ type: 'create', name: 'Кто-то другой' });
            expect(user.room.seats[0]).toMatchObject({ name: 'Расул', avatar: 'preset:3', member: true });

            const guest = client();
            guest.say({ type: 'join', code: user.room.code, name: 'Алия' });
            expect(guest.room.seats[2]).toMatchObject({ name: 'Алия', avatar: null, member: false });
        });

        it('gives an account its seat back from another window, and lets the old window go', () => {
            const phone = new Client(lobby, { userId: 'u1', name: 'Расул', avatar: null });
            phone.say({ type: 'create', name: 'Расул' });
            const laptop = new Client(lobby, { userId: 'u1', name: 'Расул', avatar: null });
            laptop.say({ type: 'join', code: phone.room.code, name: 'Расул' });

            expect(laptop.seat).toBe(phone.seat);
            expect(laptop.room.seats.filter((s) => s.kind === 'human')).toHaveLength(1);
            expect(phone.errors).toEqual(['replaced']);
            phone.say({ type: 'start' });
            expect(phone.errors).toEqual(['replaced', 'notInRoom']);
            // The old window closing must not disturb the new one.
            lobby.disconnect(phone);
            expect(laptop.room.seats[laptop.seat].connected).toBe(true);
        });
    });

    describe('keeping matches', () => {
        let records: MatchRecord[];
        beforeEach(() => {
            records = [];
            lobby = new Lobby({ onMatch: (record) => records.push(record) });
        });

        it('hands over the whole match once it is won: who played, every hand, every move', () => {
            const host = new Client(lobby, { userId: 'u1', name: 'Расул', avatar: 'preset:1' });
            const guest = client();
            host.say({ type: 'create', name: 'Расул' });
            guest.say({ type: 'join', code: host.room.code, name: 'Алия', device: 'device-0001' });
            host.say({ type: 'start' });

            for (let guard = 0; host.view.phase !== 'matchOver'; guard++) {
                if (guard > 5000) throw new Error('Match did not finish');
                moveIfDue(host);
                moveIfDue(guest);
                vi.runOnlyPendingTimers();
            }

            expect(records).toHaveLength(1);
            const [record] = records;
            expect(record.score).toEqual(host.view.matchScore);
            expect(record.winner).toBe(host.view.matchWinner);
            expect(record.hands).toHaveLength(record.score[0] + record.score[1]);
            expect(record.hands.every((hand) => hand.trump !== null && Math.max(...hand.tricks) === 7)).toBe(true);
            expect(record.players).toEqual([
                { seat: 0, kind: 'human', userId: 'u1', deviceId: null, name: 'Расул', avatar: 'preset:1' },
                { seat: 1, kind: 'bot', userId: null, deviceId: null, name: 'Дильназ', avatar: null },
                { seat: 2, kind: 'human', userId: null, deviceId: 'device-0001', name: 'Алия', avatar: null },
                { seat: 3, kind: 'bot', userId: null, deviceId: null, name: 'Рамиля', avatar: null },
            ]);
            // One trump call per hand, and a deal between hands.
            expect(record.actions.filter((a) => a.startsWith('t'))).toHaveLength(record.hands.length);
            expect(record.actions.filter((a) => a === 'n')).toHaveLength(record.hands.length - 1);

            // A rematch is a match of its own.
            host.say({ type: 'rematch' });
            expect(host.view.matchScore).toEqual([0, 0]);
            expect(records).toHaveLength(1);
        });
    });

    describe('surviving a restart', () => {
        let saved: Map<string, RoomSnapshot>;
        const options = (): LobbyOptions => ({
            archive: {
                save: (code, snapshot) => saved.set(code, structuredClone(snapshot)),
                remove: (code) => saved.delete(code),
            },
        });
        beforeEach(() => {
            saved = new Map();
            lobby = new Lobby(options());
        });

        it('brings a running game back exactly as it was, and its players back to their seats', () => {
            const { host, guest } = startedTable();
            for (let i = 0; i < 25; i++) {
                moveIfDue(host);
                moveIfDue(guest);
                vi.runOnlyPendingTimers();
            }
            const code = host.room.code;
            const before = { host: host.view, guest: guest.view };
            const tokens = { host: host.last('joined').token, guest: guest.last('joined').token };

            // The server goes down and a new one comes up with what was saved.
            lobby.freeze();
            lobby = new Lobby(options());
            lobby.restore([...saved.values()]);
            expect(lobby.roomCount).toBe(1);

            // Until someone returns, nothing moves.
            vi.advanceTimersByTime(60_000);
            const hostAgain = client();
            hostAgain.say({ type: 'join', code, name: 'Расул', token: tokens.host });
            expect(hostAgain.seat).toBe(host.seat);
            expect(hostAgain.view).toEqual(before.host);
            expect(hostAgain.room.seats[guest.seat]).toMatchObject({ kind: 'human', name: 'Алия', connected: false });

            const guestAgain = client();
            guestAgain.say({ type: 'join', code, name: 'Алия', token: tokens.guest });
            expect(guestAgain.view.hand).toEqual(before.guest.hand);

            // And the game goes on to the end of the hand.
            for (let guard = 0; hostAgain.view.handNumber === before.host.handNumber && hostAgain.view.phase !== 'matchOver'; guard++) {
                if (guard > 300) throw new Error('Hand did not finish');
                moveIfDue(hostAgain);
                moveIfDue(guestAgain);
                vi.runOnlyPendingTimers();
            }
            expect([...hostAgain.errors, ...guestAgain.errors]).toEqual([]);
        });

        it('forgets a revived table nobody came back to, and a table that was closed', () => {
            const host = client();
            host.say({ type: 'create', name: 'Расул' });
            expect(saved.size).toBe(1);

            lobby.freeze();
            lobby = new Lobby(options());
            lobby.restore([...saved.values()]);
            vi.advanceTimersByTime(10 * 60_000);
            expect(lobby.roomCount).toBe(0);
            expect(saved.size).toBe(0);
        });
    });
});
