import { describe, expect, it } from 'vitest';
import {
    apply,
    chooseBotAction,
    createGame,
    legalCards,
    nextSeat,
    partnerOf,
    RuleError,
    sameCard,
    teamOf,
    viewFor,
    winningPlay,
    type Card,
    type GameEvent,
    type GameState,
    type Rank,
    type Seat,
    type Suit,
} from './index';

const SUIT_LETTERS: Record<string, Suit> = { S: 'spades', H: 'hearts', C: 'clubs', D: 'diamonds' };

/** card('AS') → ace of spades, card('10H') → ten of hearts. */
function card(code: string): Card {
    return { rank: code.slice(0, -1) as Rank, suit: SUIT_LETTERS[code.slice(-1)] };
}
const cards = (codes: string) => codes.split(' ').map(card);

/** A hand in the `playing` phase with hand-picked cards; seat 0 leads. */
function playingState(hands: string[], trump: Suit, overrides: Partial<GameState> = {}): GameState {
    const { state } = createGame({ seed: 1 });
    return {
        ...state,
        phase: 'playing',
        caller: 0,
        turn: 0,
        trick: { leader: 0, plays: [] },
        trump,
        stock: [],
        hands: hands.map(cards),
        ...overrides,
    };
}

function play(state: GameState, seat: Seat, code: string): GameState {
    return apply(state, { type: 'playCard', seat, card: card(code) }).state;
}

function expectRuleError(fn: () => unknown, code: RuleError['code']): void {
    try {
        fn();
    } catch (error) {
        expect(error).toBeInstanceOf(RuleError);
        expect((error as RuleError).code).toBe(code);
        return;
    }
    throw new Error(`Expected RuleError "${code}"`);
}

/** Lets four bots play until the match ends; returns the final state and all events. */
function playOut(seed: number, rules = {}): { state: GameState; events: GameEvent[] } {
    let { state, events } = createGame({ seed, rules });
    const all = [...events];
    for (let step = 0; state.phase !== 'matchOver'; step++) {
        if (step > 5000) throw new Error('Match did not finish');
        const seat = state.phase === 'choosingTrump' ? state.caller : state.turn;
        const action =
            state.phase === 'handOver'
                ? ({ type: 'nextHand' } as const)
                : chooseBotAction(viewFor(state, seat));
        if (!action) throw new Error(`Bot at seat ${seat} had no action in phase ${state.phase}`);
        ({ state, events } = apply(state, action));
        all.push(...events);
    }
    return { state, events: all };
}

describe('dealing and trump', () => {
    it('is deterministic for a given seed', () => {
        expect(createGame({ seed: 42 }).state).toEqual(createGame({ seed: 42 }).state);
        expect(createGame({ seed: 42 }).state.hands).not.toEqual(createGame({ seed: 43 }).state.hands);
    });

    it('deals 5 cards each before trump is named and keeps the rest in stock', () => {
        const { state, events } = createGame({ seed: 7 });
        expect(state.phase).toBe('choosingTrump');
        expect(state.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
        expect(state.stock).toHaveLength(32);
        expect(events).toEqual([{ type: 'handDealt', handNumber: 0, caller: state.caller }]);
    });

    it('deals out the full deck once the caller names trump, and the caller leads', () => {
        const { state } = createGame({ seed: 7 });
        const next = apply(state, { type: 'chooseTrump', seat: state.caller, suit: 'hearts' }).state;

        expect(next.phase).toBe('playing');
        expect(next.trump).toBe('hearts');
        expect(next.turn).toBe(state.caller);
        expect(next.hands.map((h) => h.length)).toEqual([13, 13, 13, 13]);
        const unique = new Set(next.hands.flat().map((c) => `${c.rank}${c.suit}`));
        expect(unique.size).toBe(52);
        // The five cards the caller saw are still in their hand.
        for (const seen of state.hands[state.caller]) {
            expect(next.hands[state.caller].some((c) => sameCard(c, seen))).toBe(true);
        }
    });

    it('can deal all 13 cards before trump when the rules say so', () => {
        const { state } = createGame({ seed: 7, rules: { trumpAfterCards: 13 } });
        expect(state.hands.map((h) => h.length)).toEqual([13, 13, 13, 13]);
        expect(state.stock).toHaveLength(0);
    });

    it('rejects trump from anyone but the caller, and cards before trump', () => {
        const { state } = createGame({ seed: 7 });
        const other = nextSeat(state.caller);
        expectRuleError(() => apply(state, { type: 'chooseTrump', seat: other, suit: 'clubs' }), 'notYourTurn');
        expectRuleError(
            () => apply(state, { type: 'playCard', seat: state.caller, card: state.hands[state.caller][0] }),
            'wrongPhase',
        );
    });
});

describe('playing a trick', () => {
    const hands = ['AS 2H', 'KS 3H', '2S 4H', '5D 6D'];

    it('passes the turn around the table', () => {
        const state = play(playingState(hands, 'clubs'), 0, 'AS');
        expect(state.turn).toBe(1);
        expect(state.trick.plays).toEqual([{ seat: 0, card: card('AS') }]);
        expect(state.hands[0]).toEqual(cards('2H'));
    });

    it('does not mutate the state it was given', () => {
        const before = playingState(hands, 'clubs');
        const snapshot = structuredClone(before);
        play(before, 0, 'AS');
        expect(before).toEqual(snapshot);
    });

    it('rejects out-of-turn plays, cards not in hand, and failing to follow suit', () => {
        const state = playingState(hands, 'clubs');
        expectRuleError(() => play(state, 1, 'KS'), 'notYourTurn');
        expectRuleError(() => play(state, 0, 'KS'), 'cardNotInHand');
        expectRuleError(() => play(play(state, 0, 'AS'), 1, '3H'), 'mustFollowSuit');
    });

    it('lets a player with none of the led suit play anything', () => {
        const state = playingState(hands, 'clubs', { turn: 3, trick: { leader: 0, plays: [{ seat: 0, card: card('AS') }] } });
        expect(legalCards(state.hands[3], state.trick)).toEqual(cards('5D 6D'));
    });

    it('gives the trick to the highest card of the led suit, who then leads', () => {
        let state = playingState(hands, 'clubs');
        state = play(state, 0, '2H');
        state = play(state, 1, '3H');
        state = play(state, 2, '4H');
        const result = apply(state, { type: 'playCard', seat: 3, card: card('6D') });

        expect(result.state.lastTrick?.winner).toBe(2);
        expect(result.state.turn).toBe(2);
        expect(result.state.trick).toEqual({ leader: 2, plays: [] });
        expect(result.state.tricksWon).toEqual([1, 0]);
        expect(result.events.map((e) => e.type)).toEqual(['cardPlayed', 'trickWon']);
    });

    it('lets a trump beat any plain card, and the higher trump beat a lower one', () => {
        const at = (codes: string) => cards(codes).map((c, seat) => ({ seat: seat as Seat, card: c }));
        expect(winningPlay(at('AS KS 2D QS'), 'diamonds').seat).toBe(2);
        expect(winningPlay(at('AS 2D 9D QS'), 'diamonds').seat).toBe(2);
        // An off-suit card that is not trump never wins, however high.
        expect(winningPlay(at('2S AH AC 3S'), 'diamonds').seat).toBe(3);
    });
});

describe('hands and the match', () => {
    /** Seat 0 holds the top spades, so it wins every trick it leads. */
    function sevenTrickState(overrides: Partial<GameState> = {}): GameState {
        return playingState(
            ['AS KS QS JS 10S 9S 8S', '2H 3H 4H 5H 6H 7H 8H', '2C 3C 4C 5C 6C 7C 8C', '2D 3D 4D 5D 6D 7D 8D'],
            'spades',
            overrides,
        );
    }

    function playSevenTricks(start: GameState) {
        let result = { state: start, events: [] as GameEvent[] };
        for (let trick = 0; trick < 7; trick++) {
            for (const seat of [0, 1, 2, 3] as Seat[]) {
                result = apply(result.state, { type: 'playCard', seat, card: result.state.hands[seat][0] });
            }
        }
        return result;
    }

    it('ends the hand when a team takes its seventh trick', () => {
        const { state, events } = playSevenTricks(sevenTrickState());
        expect(state.phase).toBe('handOver');
        expect(state.handWinner).toBe(0);
        expect(state.tricksWon).toEqual([7, 0]);
        expect(state.matchScore).toEqual([1, 0]);
        expect(events.map((e) => e.type)).toEqual(['cardPlayed', 'trickWon', 'handWon']);
        expectRuleError(() => apply(state, { type: 'playCard', seat: 0, card: card('AS') }), 'wrongPhase');
    });

    it('keeps the call with a caller whose team won, and passes it on otherwise', () => {
        const won = apply(playSevenTricks(sevenTrickState({ caller: 2 })).state, { type: 'nextHand' }).state;
        expect(won.caller).toBe(2);

        const lost = apply(playSevenTricks(sevenTrickState({ caller: 1 })).state, { type: 'nextHand' }).state;
        expect(lost.caller).toBe(2);

        expect(won.phase).toBe('choosingTrump');
        expect(won.handNumber).toBe(1);
        expect(won.tricksWon).toEqual([0, 0]);
        expect(won.trump).toBeNull();
        expect(won.matchScore).toEqual([1, 0]);
    });

    it('ends the match when a team reaches the target', () => {
        const { state, events } = playSevenTricks(sevenTrickState({ matchScore: [6, 3] }));
        expect(state.phase).toBe('matchOver');
        expect(state.matchWinner).toBe(0);
        expect(events[events.length - 1]).toEqual({ type: 'matchWon', team: 0, matchScore: [7, 3] });
        expectRuleError(() => apply(state, { type: 'nextHand' }), 'wrongPhase');
    });
});

describe('player views', () => {
    it('shows a player their own hand and only the sizes of the others', () => {
        const { state } = createGame({ seed: 3 });
        const view = viewFor(state, 2);
        expect(view.hand).toEqual(state.hands[2]);
        expect(view.handSizes).toEqual([5, 5, 5, 5]);
        expect(view).not.toHaveProperty('hands');
        expect(view).not.toHaveProperty('stock');
        expect(view).not.toHaveProperty('rng');
    });
});

describe('bots', () => {
    it('play complete, legal matches from any seed', () => {
        for (let seed = 1; seed <= 200; seed++) {
            const { state, events } = playOut(seed, { matchTarget: 3 });
            expect(state.matchWinner).not.toBeNull();
            expect(Math.max(...state.matchScore)).toBe(3);
            for (const event of events) {
                if (event.type === 'handWon') expect(event.tricksWon[event.team]).toBe(7);
            }
        }
    }, 60_000); // 200 whole matches: CPU-bound, so slow machines need room.

    it('play all 13 tricks when the hand does not stop at seven', () => {
        const { events } = playOut(5, { matchTarget: 1, stopAtSevenTricks: false });
        expect(events.filter((e) => e.type === 'trickWon')).toHaveLength(13);
    });

    it('do not waste a winner on a trick their partner is already taking', () => {
        const state = playingState(['2S', '3S', 'AS KS', '4S'], 'hearts', {
            turn: 2,
            trick: { leader: 0, plays: [{ seat: 0, card: card('QS') }, { seat: 1, card: card('3S') }] },
        });
        expect(partnerOf(2)).toBe(0);
        expect(teamOf(0)).toBe(teamOf(2));
        expect(chooseBotAction(viewFor(state, 2))).toEqual({ type: 'playCard', seat: 2, card: card('KS') });
    });

    it('trump in when they cannot follow suit and an opponent is winning', () => {
        const state = playingState(['2S', 'AS', '7D 2H', '4S'], 'hearts', {
            turn: 2,
            trick: { leader: 1, plays: [{ seat: 1, card: card('AS') }] },
        });
        expect(chooseBotAction(viewFor(state, 2))).toEqual({ type: 'playCard', seat: 2, card: card('2H') });
    });
});
