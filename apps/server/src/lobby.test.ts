import { legalCards, type PlayerView, type Seat } from '@cort/engine';
import type { ClientMessage, RoomInfo, ServerMessage } from '@cort/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lobby } from './lobby';
import type { Connection } from './room';

/** A fake client: records everything the server sends it. */
class Client implements Connection {
    messages: ServerMessage[] = [];

    constructor(private lobby: Lobby) {}

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
        return this.last('joined').seat;
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
        const { seat, token } = guest.last('joined');
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
        const host = client();
        host.say({ type: 'create', name: 'Расул', open: true });
        const { code, token, seat } = host.last('joined');

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
        const { code, token, seat } = host.last('joined');

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
        const open = client();
        open.say({ type: 'create', name: 'Расул', title: '  Вечерний корт  ', open: true });
        const secret = client();
        secret.say({ type: 'create', name: 'Алия' });

        expect(lobby.openRooms()).toEqual([
            { code: open.room.code, title: 'Вечерний корт', host: 'Расул', players: 1, started: false },
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
        const host = client();
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
        const host = client();
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
        guest.say({ type: 'emote', emote: '🔥' });
        expect(host.last('emote')).toEqual({ type: 'emote', seat: guest.seat, emote: '🔥' });
        guest.say({ type: 'emote', emote: 'trump' });
        expect(host.last('emote')).toEqual({ type: 'emote', seat: guest.seat, emote: 'trump' });

        const before = host.messages.length;
        guest.say({ type: 'emote', emote: '<script>' });
        expect(host.messages.length).toBe(before);
    });
});
