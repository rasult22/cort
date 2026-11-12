import { RANKS, SUITS, type Card, type Play, type Seat, type Suit, type Team, type Trick } from './types';

export const rankValue = (card: Card): number => RANKS.indexOf(card.rank);

/** Stable identifier for a card, e.g. "10-hearts". Useful as a UI key. */
export const cardId = (card: Card): string => `${card.rank}-${card.suit}`;

export const sameCard =(a: Card, b: Card): boolean => a.suit === b.suit && a.rank === b.rank;

export const teamOf = (seat: Seat): Team => (seat % 2) as Team;
export const nextSeat = (seat: Seat): Seat => ((seat + 1) % 4) as Seat;
export const partnerOf = (seat: Seat): Seat => ((seat + 2) % 4) as Seat;

export function createDeck(): Card[] {
    return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
}

/** mulberry32: returns a float in [0, 1) and the next RNG state. */
export function nextRandom(state: number): [number, number] {
    const next = (state + 0x6d2b79f5) | 0;
    let t = next;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

export function shuffle<T>(items: readonly T[], rng: number): [T[], number] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        let r: number;
        [r, rng] = nextRandom(rng);
        const j = Math.floor(r * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return [result, rng];
}

/** Cards from `hand` that may be played into `trick`: follow the led suit if you can. */
export function legalCards(hand: readonly Card[], trick: Trick): Card[] {
    if (trick.plays.length === 0) return [...hand];
    const led = trick.plays[0].card.suit;
    const following = hand.filter((c) => c.suit === led);
    return following.length > 0 ? following : [...hand];
}

/** True if `challenger` beats `current`, given that `current` is winning the trick so far. */
export function beats(challenger: Card, current: Card, trump: Suit | null): boolean {
    if (challenger.suit === current.suit) return rankValue(challenger) > rankValue(current);
    return challenger.suit === trump;
}

export function winningPlay(plays: readonly Play[], trump: Suit | null): Play {
    return plays.reduce((best, play) => (beats(play.card, best.card, trump) ? play : best));
}

/** Display order: grouped by suit, high to low. */
export function sortHand(hand: readonly Card[]): Card[] {
    return [...hand].sort(
        (a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || rankValue(b) - rankValue(a),
    );
}
