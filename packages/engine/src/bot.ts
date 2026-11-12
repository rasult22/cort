import { beats, legalCards, partnerOf, rankValue, winningPlay } from './cards';
import { SUITS, type Action, type Card, type PlayerView, type Suit } from './types';

/**
 * A simple, honest bot: it only sees its own PlayerView, never other hands.
 * Returns null when it is not this seat's move.
 */
export function chooseBotAction(view: PlayerView): Action | null {
    if (view.phase === 'choosingTrump' && view.caller === view.seat) {
        return { type: 'chooseTrump', seat: view.seat, suit: chooseTrump(view.hand) };
    }
    if (view.phase === 'playing' && view.turn === view.seat) {
        return { type: 'playCard', seat: view.seat, card: chooseCard(view) };
    }
    return null;
}

/** Longest suit, ties broken by high cards. */
function chooseTrump(hand: Card[]): Suit {
    const score = (suit: Suit) =>
        hand.filter((c) => c.suit === suit).reduce((sum, c) => sum + 20 + rankValue(c), 0);
    return [...SUITS].sort((a, b) => score(b) - score(a))[0];
}

function chooseCard(view: PlayerView): Card {
    const { trump, trick } = view;
    const legal = legalCards(view.hand, trick);
    // "Cheapness": plain suits before trumps, then low before high.
    const cost = (c: Card) => (c.suit === trump ? 100 : 0) + rankValue(c);
    const cheapestFirst = [...legal].sort((a, b) => cost(a) - cost(b));
    const cheapest = cheapestFirst[0];

    if (trick.plays.length === 0) {
        // Cash a plain-suit ace or king, otherwise get rid of the cheapest card.
        const topPlain = legal
            .filter((c) => c.suit !== trump && rankValue(c) >= rankValue({ suit: c.suit, rank: 'K' }))
            .sort((a, b) => rankValue(b) - rankValue(a))[0];
        return topPlain ?? cheapest;
    }

    const winning = winningPlay(trick.plays, trump);
    if (winning.seat === partnerOf(view.seat)) return cheapest;

    const winners = cheapestFirst.filter((c) => beats(c, winning.card, trump));
    if (winners.length === 0) return cheapest;

    // Last to play: win as cheaply as possible. Otherwise, when following
    // suit, go high so the players behind us have a harder time.
    const isLast = trick.plays.length === 3;
    const followingSuit = winners[0].suit === trick.plays[0].card.suit;
    return isLast || !followingSuit ? winners[0] : winners[winners.length - 1];
}
