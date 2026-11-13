import { DEFAULT_RULES, type Card, type GameEvent, type Play, type PlayerView, type Rank, type Seat, type Suit, type Team } from '@cort/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalSession, MomentTracker, TableStore, momentWeight, topMoment, type Moment, type SessionEvent } from './index';
import { BaseSession, type Session } from './session';

const card = (text: string): Card => {
    const suits: Record<string, Suit> = { s: 'spades', h: 'hearts', c: 'clubs', d: 'diamonds' };
    return { rank: text.slice(0, -1) as Rank, suit: suits[text.slice(-1)] };
};
/** "0:Ah 1:7s" → plays in order. */
const plays = (text: string): Play[] =>
    text.split(' ').map((part) => {
        const [seat, c] = part.split(':');
        return { seat: Number(seat) as Seat, card: card(c) };
    });

function view(patch: Partial<PlayerView>): PlayerView {
    return {
        rules: DEFAULT_RULES,
        phase: 'playing',
        handNumber: 0,
        caller: 0,
        trump: 'spades',
        turn: 0,
        trick: { leader: 0, plays: [] },
        lastTrick: null,
        tricksWon: [0, 0],
        matchScore: [0, 0],
        handWinner: null,
        matchWinner: null,
        seat: 0,
        hand: [],
        handSizes: [13, 13, 13, 13],
        ...patch,
    };
}

/** A card played into a trick that is still open. */
function midTrick(tracker: MomentTracker, text: string): Moment[] {
    const all = plays(text);
    const last = all[all.length - 1];
    return tracker.observe([{ type: 'cardPlayed', ...last }], view({ trick: { leader: all[0].seat, plays: all } }));
}

/** The fourth card: the trick is won, and with `handWon` the hand as well. */
function endTrick(tracker: MomentTracker, text: string, winner: Seat, tricksWon: [number, number], handWon?: Team): Moment[] {
    const all = plays(text);
    const last = all[all.length - 1];
    const team = (winner % 2) as Team;
    const events: GameEvent[] = [
        { type: 'cardPlayed', ...last },
        { type: 'trickWon', seat: winner, team, trick: { leader: all[0].seat, plays: all, winner } },
    ];
    if (handWon !== undefined) events.push({ type: 'handWon', team: handWon, tricksWon });
    return tracker.observe(events, view({ tricksWon, phase: handWon === undefined ? 'playing' : 'handOver' }));
}

const dealt: GameEvent = { type: 'handDealt', handNumber: 0, caller: 0 };
const types = (moments: Moment[]) => moments.map((m) => m.type);

describe('key moments', () => {
    it('notices a trump taking an opponent’s ace or king', () => {
        const tracker = new MomentTracker();
        expect(midTrick(tracker, '0:Ah 1:2s')).toEqual([
            { type: 'trumpedHigh', seat: 1, victim: 0, card: card('2s'), beaten: card('Ah') },
        ]);
        expect(types(midTrick(tracker, '0:9h 1:Kh 2:3s'))).toEqual(['trumpedHigh']);

        // Nothing special: a small card trumped, a partner's ace trumped, or simply following suit.
        expect(midTrick(tracker, '0:9h 1:2s')).toEqual([]);
        expect(midTrick(tracker, '0:Ah 1:5h 2:2s')).toEqual([]);
        expect(midTrick(tracker, '0:Kh 1:Ah')).toEqual([]);
        // When trumps are led, a bigger trump is just the game.
        expect(midTrick(tracker, '0:Ks 1:As')).toEqual([]);
    });

    it('notices a trump going over an opponent’s trump', () => {
        const tracker = new MomentTracker();
        expect(midTrick(tracker, '0:Ah 1:2s 2:9s')).toEqual([
            { type: 'overtrump', seat: 2, victim: 1, card: card('9s'), beaten: card('2s') },
        ]);
        // A smaller trump under a bigger one beats nothing.
        expect(midTrick(tracker, '0:Ah 1:9s 2:2s')).toEqual([]);
        // Over a partner's trump: a waste, not a moment.
        expect(midTrick(tracker, '0:Ah 1:2s 2:5h 3:9s')).toEqual([]);
    });

    it('notices a partner winning back a trick that had been taken away', () => {
        const tracker = new MomentTracker();
        // Seat 0 leads the king, seat 1 covers with the ace, seat 2 trumps for the team.
        expect(endTrick(tracker, '0:Kh 1:Ah 2:2s 3:5h', 2, [1, 0])).toEqual([{ type: 'partnerSaved', seat: 2, partner: 0 }]);

        // The partner never had the trick: nothing was saved.
        expect(types(endTrick(tracker, '1:Ah 0:5h 3:7h 2:2s', 2, [2, 0]))).toEqual(['trumpedHigh']);
        // Winning what the partner already had is not a rescue either.
        expect(endTrick(tracker, '0:Kh 1:5h 2:Ah 3:7h', 2, [3, 0])).toEqual([]);
    });

    it('calls the last chance when a team reaches six tricks', () => {
        const tracker = new MomentTracker();
        expect(endTrick(tracker, '0:Kh 1:5h 2:7h 3:8h', 0, [6, 3])).toEqual([{ type: 'lastChance', team: 1 }]);
        expect(endTrick(tracker, '1:Kh 2:5h 3:7h 0:8h', 1, [6, 5])).toEqual([]);
        // Six all: the next trick decides the hand for both.
        expect(endTrick(tracker, '1:Kd 2:5d 3:7d 0:8d', 1, [6, 6])).toEqual([{ type: 'lastChance', team: null }]);
    });

    it('marks the trick that ends the hand, a dry win and a comeback', () => {
        const dry = new MomentTracker();
        dry.observe([dealt], view({}));
        for (let n = 1; n <= 6; n++) endTrick(dry, '0:Kh 1:5h 2:7h 3:8h', 0, [n, 0]);
        expect(endTrick(dry, '0:Kh 1:5h 2:7h 3:8h', 0, [7, 0], 0)).toEqual([
            { type: 'sweep', team: 0 },
            { type: 'decider', seat: 0, team: 0 },
        ]);

        // Team 1 runs away to 4:0, then team 0 takes seven of the next eight.
        const comeback = new MomentTracker();
        comeback.observe([dealt], view({}));
        for (let n = 1; n <= 4; n++) endTrick(comeback, '1:Kh 2:5h 3:7h 0:8h', 1, [0, n]);
        for (let n = 1; n <= 6; n++) endTrick(comeback, '0:Kh 1:5h 2:7h 3:8h', 0, [n, n === 6 ? 5 : 4]);
        expect(endTrick(comeback, '0:Kh 1:5h 2:7h 3:8h', 2, [7, 5], 0)).toEqual([
            { type: 'comeback', team: 0, deficit: 4 },
            { type: 'decider', seat: 2, team: 0 },
        ]);

        // An ordinary hand ends with nothing but the deciding trick.
        const plain = new MomentTracker();
        plain.observe([dealt], view({}));
        endTrick(plain, '1:Kh 2:5h 3:7h 0:8h', 1, [0, 1]);
        expect(types(endTrick(plain, '0:Kh 1:5h 2:7h 3:8h', 0, [7, 1], 0))).toEqual(['decider']);

        // Having come in halfway, we cannot claim a comeback we did not see.
        const late = new MomentTracker();
        endTrick(late, '0:Kh 1:5h 2:7h 3:8h', 0, [3, 6]);
        expect(types(endTrick(late, '0:Kh 1:5h 2:7h 3:8h', 0, [7, 6], 0))).toEqual(['decider']);
    });

    it('shows only the rarest of several moments, and grades how loud each one is', () => {
        const sweep: Moment = { type: 'sweep', team: 0 };
        const decider: Moment = { type: 'decider', seat: 0, team: 0 };
        const overtrump: Moment = { type: 'overtrump', seat: 2, victim: 1, card: card('9s'), beaten: card('2s') };
        expect(topMoment([decider, sweep])).toBe(sweep);
        expect(topMoment([decider, overtrump])).toBe(overtrump);
        expect(topMoment([])).toBeNull();
        expect([sweep, overtrump, decider].map(momentWeight)).toEqual(['big', 'medium', 'small']);
    });

    it('stays quiet through most of a real match', () => {
        vi.useFakeTimers();
        const session = new LocalSession({ name: 'Расул', seed: 21, demo: true, rules: { matchTarget: 3 } });
        const tracker = new MomentTracker();
        let tricks = 0;
        let loud = 0;
        const seen = new Set<string>();
        const unsubscribe = session.subscribe((event) => {
            if (event.type !== 'update') return;
            if (event.events.some((e) => e.type === 'trickWon')) tricks++;
            const moment = topMoment(tracker.observe(event.events, event.view));
            if (!moment) return;
            seen.add(moment.type);
            if (momentWeight(moment) !== 'small') loud++;
        });
        vi.runAllTimers();
        unsubscribe();
        session.dispose();
        vi.useRealTimers();

        expect(tricks).toBeGreaterThan(20);
        expect(seen.has('decider')).toBe(true);
        // A flash on every other trick would mean nothing: most tricks pass without one.
        expect(loud).toBeLessThan(tricks / 2);
    });
});

/** A session we feed by hand, to put the table in exactly the situation we need. */
class Script extends BaseSession implements Session {
    push = (event: SessionEvent) => this.emit(event);
    start() {}
    sit() {}
    chooseTrump() {}
    playCard() {}
    rematch() {}
    emote() {}
    dispose() {}
}

describe('the table during a moment', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const room = { code: 'TEST', title: '', open: false, host: 0 as Seat, started: true, spectators: [], seats: [] };

    it('puts the moment on screen for a while, and makes a reaction thrown at it last longer', () => {
        const session = new Script();
        const felt: [Moment['type'], boolean | null][] = [];
        const store = new TableStore(session, { play() {}, deal() {}, haptic() {}, moment: (m, ours) => felt.push([m.type, ours]) });
        store.connect();
        session.push({ type: 'room', room, seat: 1 });

        // An opponent's ace is trumped by seat 1 — that is us.
        const all = plays('0:Ah 1:2s');
        session.push({ type: 'update', view: view({ seat: 1, trick: { leader: 0, plays: all } }), events: [{ type: 'cardPlayed', ...all[1] }] });
        expect(store.getSnapshot().moment?.moment.type).toBe('trumpedHigh');
        expect(felt).toEqual([['trumpedHigh', true]]);

        session.push({ type: 'emote', seat: 2, emote: '🔥' });
        expect(store.getSnapshot().emotes[2]).toMatchObject({ emote: '🔥', sticky: true });

        vi.advanceTimersByTime(2000);
        expect(store.getSnapshot().moment).toBeNull();
        // An ordinary reaction would be gone by now; this one is still on the table.
        vi.advanceTimersByTime(2000);
        expect(store.getSnapshot().emotes[2]).toBeDefined();
        vi.advanceTimersByTime(3000);
        expect(store.getSnapshot().emotes[2]).toBeUndefined();

        session.push({ type: 'emote', seat: 2, emote: '👍' });
        expect(store.getSnapshot().emotes[2]?.sticky).toBeUndefined();
        store.disconnect();
    });

    it('keeps a spectator out of it: no cards, no turn, nobody’s side', () => {
        const session = new Script();
        const cues: string[] = [];
        const felt: (boolean | null)[] = [];
        const store = new TableStore(session, { play: (cue) => cues.push(cue), deal() {}, haptic() {}, moment: (_m, ours) => felt.push(ours) });
        store.connect();
        session.push({ type: 'room', room, seat: 0, watching: true, spectatorId: 4 });
        expect(store.getSnapshot()).toMatchObject({ watching: true, spectatorId: 4 });

        // It would be seat 0's turn — but nobody is sitting there for us.
        const all = plays('3:Ah');
        session.push({ type: 'update', view: view({ turn: 0, trick: { leader: 3, plays: all } }), events: [{ type: 'cardPlayed', ...all[0] }] });
        expect(cues).toEqual(['card']);

        const taken = plays('3:Ah 0:2s');
        session.push({ type: 'update', view: view({ turn: 1, trick: { leader: 3, plays: taken } }), events: [{ type: 'cardPlayed', ...taken[1] }] });
        expect(felt).toEqual([null]);

        session.push({ type: 'emote', seat: null, spectator: 9, emote: '👏' });
        expect(store.getSnapshot().spectatorEmotes[9]?.emote).toBe('👏');
        vi.advanceTimersByTime(10_000);
        expect(store.getSnapshot().spectatorEmotes).toEqual({});
        store.disconnect();
    });

    it('carries the clock on a move, and nudges us when our own time is nearly up', () => {
        const session = new Script();
        const cues: string[] = [];
        const store = new TableStore(session, { play: (cue) => cues.push(cue), deal() {}, haptic() {} });
        store.connect();
        session.push({ type: 'room', room, seat: 0 });

        const timer = { seat: 0 as Seat, endsAt: Date.now() + 30_000, total: 30_000 };
        session.push({ type: 'update', view: view({ turn: 0 }), events: [], timer });
        expect(store.getSnapshot().timer).toEqual(timer);

        vi.advanceTimersByTime(24_000);
        expect(cues).toEqual([]);
        vi.advanceTimersByTime(1500);
        expect(cues).toEqual(['turn']);

        // The move was made: the clock is gone, and so is the nudge for the next one.
        session.push({ type: 'update', view: view({ turn: 1 }), events: [], timer: null });
        expect(store.getSnapshot().timer).toBeNull();
        store.disconnect();
    });
});
