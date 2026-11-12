import { createDeck, legalCards, nextRandom, nextSeat, sameCard, shuffle, teamOf, winningPlay } from './cards';
import {
    DEFAULT_RULES,
    RuleError,
    type Action,
    type GameEvent,
    type GameState,
    type PlayerView,
    type Rules,
    type Seat,
} from './types';

export interface Result {
    state: GameState;
    events: GameEvent[];
}

export function createGame(options: { seed: number; rules?: Partial<Rules> }): Result {
    const [r, rng] = nextRandom(options.seed | 0);
    const state: GameState = {
        rules: { ...DEFAULT_RULES, ...options.rules },
        rng,
        phase: 'choosingTrump',
        handNumber: 0,
        caller: Math.floor(r * 4) as Seat,
        hands: [[], [], [], []],
        stock: [],
        trump: null,
        turn: 0,
        trick: { leader: 0, plays: [] },
        lastTrick: null,
        tricksWon: [0, 0],
        matchScore: [0, 0],
        handWinner: null,
        matchWinner: null,
    };
    const events: GameEvent[] = [];
    dealHand(state, events);
    return { state, events };
}

/**
 * The only way the game moves forward. Never mutates its input; throws
 * RuleError for an illegal action and leaves the caller's state untouched.
 */
export function apply(previous: GameState, action: Action): Result {
    const state = structuredClone(previous);
    const events: GameEvent[] = [];

    switch (action.type) {
        case 'chooseTrump': {
            requirePhase(state, 'choosingTrump');
            if (action.seat !== state.caller) {
                throw new RuleError('notYourTurn', 'Only the caller names trump');
            }
            state.trump = action.suit;
            state.stock.forEach((card, i) => state.hands[(state.caller + i) % 4].push(card));
            state.stock = [];
            state.phase = 'playing';
            events.push({ type: 'trumpChosen', seat: action.seat, suit: action.suit });
            break;
        }

        case 'playCard': {
            requirePhase(state, 'playing');
            if (action.seat !== state.turn) throw new RuleError('notYourTurn', 'Not your turn');
            const hand = state.hands[action.seat];
            if (!hand.some((c) => sameCard(c, action.card))) {
                throw new RuleError('cardNotInHand', 'Card is not in hand');
            }
            if (!legalCards(hand, state.trick).some((c) => sameCard(c, action.card))) {
                throw new RuleError('mustFollowSuit', 'Must follow the led suit');
            }

            state.hands[action.seat] = hand.filter((c) => !sameCard(c, action.card));
            state.trick.plays.push({ seat: action.seat, card: action.card });
            events.push({ type: 'cardPlayed', seat: action.seat, card: action.card });

            if (state.trick.plays.length < 4) {
                state.turn = nextSeat(state.turn);
            } else {
                finishTrick(state, events);
            }
            break;
        }

        case 'nextHand': {
            requirePhase(state, 'handOver');
            // Draft rule: the caller keeps the call while their team keeps winning.
            if (state.handWinner !== teamOf(state.caller)) state.caller = nextSeat(state.caller);
            state.handNumber += 1;
            dealHand(state, events);
            break;
        }
    }

    return { state, events };
}

/** Strips everything `seat` must not see. */
export function viewFor(state: GameState, seat: Seat): PlayerView {
    const { hands, stock: _stock, rng: _rng, ...shared } = structuredClone(state);
    return { ...shared, seat, hand: hands[seat], handSizes: hands.map((h) => h.length) };
}

function requirePhase(state: GameState, phase: GameState['phase']): void {
    if (state.phase !== phase) {
        throw new RuleError('wrongPhase', `Expected phase "${phase}", but it is "${state.phase}"`);
    }
}

function dealHand(state: GameState, events: GameEvent[]): void {
    const [deck, rng] = shuffle(createDeck(), state.rng);
    const perSeat = state.rules.trumpAfterCards;
    state.rng = rng;
    state.hands = [0, 1, 2, 3].map((seat) => deck.slice(seat * perSeat, (seat + 1) * perSeat));
    state.stock = deck.slice(4 * perSeat);
    state.trump = null;
    state.turn = state.caller;
    state.trick = { leader: state.caller, plays: [] };
    state.lastTrick = null;
    state.tricksWon = [0, 0];
    state.handWinner = null;
    state.phase = 'choosingTrump';
    events.push({ type: 'handDealt', handNumber: state.handNumber, caller: state.caller });
}

function finishTrick(state: GameState, events: GameEvent[]): void {
    const winner = winningPlay(state.trick.plays, state.trump).seat;
    const team = teamOf(winner);
    const trick = { ...state.trick, winner };
    state.tricksWon[team] += 1;
    state.lastTrick = trick;
    state.trick = { leader: winner, plays: [] };
    state.turn = winner;
    events.push({ type: 'trickWon', seat: winner, team, trick });

    const played = state.tricksWon[0] + state.tricksWon[1];
    const handDone = state.rules.stopAtSevenTricks ? state.tricksWon[team] >= 7 : played === 13;
    if (!handDone) return;

    const handWinner = state.tricksWon[0] > state.tricksWon[1] ? 0 : 1;
    state.handWinner = handWinner;
    state.matchScore[handWinner] += 1;
    events.push({ type: 'handWon', team: handWinner, tricksWon: [...state.tricksWon] });

    if (state.matchScore[handWinner] >= state.rules.matchTarget) {
        state.phase = 'matchOver';
        state.matchWinner = handWinner;
        events.push({ type: 'matchWon', team: handWinner, matchScore: [...state.matchScore] });
    } else {
        state.phase = 'handOver';
    }
}
