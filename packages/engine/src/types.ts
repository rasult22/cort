export const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
    suit: Suit;
    rank: Rank;
}

/** Seats are numbered in turn order. Partners sit opposite: 0+2 vs 1+3. */
export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;

/**
 * Every rule that is still an open question in docs/RULES.md lives here,
 * so changing an answer is a config change, not an engine rewrite.
 */
export interface Rules {
    /** How many cards the trump caller sees before naming trump. */
    trumpAfterCards: 5 | 13;
    /** End the hand as soon as a team takes 7 tricks (otherwise play all 13). */
    stopAtSevenTricks: boolean;
    /** Hands needed to win the match. */
    matchTarget: number;
}

export const DEFAULT_RULES: Rules = {
    trumpAfterCards: 5,
    stopAtSevenTricks: true,
    matchTarget: 7,
};

export type Phase = 'choosingTrump' | 'playing' | 'handOver' | 'matchOver';

export interface Play {
    seat: Seat;
    card: Card;
}

export interface Trick {
    leader: Seat;
    plays: Play[];
}

export interface CompletedTrick extends Trick {
    winner: Seat;
}

/** Full, serializable game state. Only the server (or a local game) holds this. */
export interface GameState {
    rules: Rules;
    /** RNG state; advancing it is the only source of randomness. */
    rng: number;
    phase: Phase;
    handNumber: number;
    /** Names trump and leads the first trick of the hand. */
    caller: Seat;
    hands: Card[][];
    /** Cards not dealt yet (non-empty only while trump is being chosen). */
    stock: Card[];
    trump: Suit | null;
    turn: Seat;
    trick: Trick;
    lastTrick: CompletedTrick | null;
    /** Tricks taken in the current hand, per team. */
    tricksWon: [number, number];
    /** Hands won in the match, per team. */
    matchScore: [number, number];
    handWinner: Team | null;
    matchWinner: Team | null;
}

/** What a single player is allowed to know. This is what goes over the network. */
export interface PlayerView extends Omit<GameState, 'hands' | 'stock' | 'rng'> {
    seat: Seat;
    hand: Card[];
    handSizes: number[];
}

export type Action =
    | { type: 'chooseTrump'; seat: Seat; suit: Suit }
    | { type: 'playCard'; seat: Seat; card: Card }
    | { type: 'nextHand' };

/** Things that happened as a result of an action; drives animation and sound. */
export type GameEvent =
    | { type: 'handDealt'; handNumber: number; caller: Seat }
    | { type: 'trumpChosen'; seat: Seat; suit: Suit }
    | { type: 'cardPlayed'; seat: Seat; card: Card }
    | { type: 'trickWon'; seat: Seat; team: Team; trick: CompletedTrick }
    | { type: 'handWon'; team: Team; tricksWon: [number, number] }
    | { type: 'matchWon'; team: Team; matchScore: [number, number] };

export class RuleError extends Error {
    constructor(
        public code:
            | 'wrongPhase'
            | 'notYourTurn'
            | 'cardNotInHand'
            | 'mustFollowSuit',
        message: string,
    ) {
        super(message);
        this.name = 'RuleError';
    }
}
