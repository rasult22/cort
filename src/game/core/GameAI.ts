import { GameEngine, Card, Suit, Rank, Trick } from './Game';

export class GameAI {
    private game: GameEngine;
    private playerId: number;
    private teamMateId: number;

    constructor(game: GameEngine, playerId: number) {
        this.game = game;
        this.playerId = playerId;
        // Calculate teammate ID (players 0,2 are team 1, players 1,3 are team 2)
        this.teamMateId = (playerId + 2) % 4;
    }

    /**
     * Makes a decision about which card to play based on the current game state
     * @returns The index of the card to play in the player's hand
     */
    public makeMove(): number {
        const hand = this.game.getPlayerHand(this.playerId);
        const currentTrick = this.game.getCurrentTrick();
        const trumpSuit = this.game.getTrumpSuit();

        if (!currentTrick || currentTrick.cards.length === 0) {
            // First to play in the trick
            return this.chooseOpeningCard(hand, trumpSuit);
        } else {
            // Following other players
            return this.chooseFollowingCard(hand, currentTrick, trumpSuit);
        }
    }

    /**
     * Chooses a card when leading a new trick
     */
    private chooseOpeningCard(hand: Card[], trumpSuit: Suit | null): number {
        // Strategy: Lead with high cards in non-trump suits
        // If we have trump, try to save them for later
        let bestCardIndex = 0;
        let bestValue = -1;

        for (let i = 0; i < hand.length; i++) {
            const card = hand[i];
            // Skip trump cards if possible
            if (trumpSuit && card.suit === trumpSuit) continue;

            const value = this.getCardValue(card);
            if (value > bestValue) {
                bestValue = value;
                bestCardIndex = i;
            }
        }

        // If we only have trump cards, play the highest one
        if (bestValue === -1) {
            bestValue = 0;
            for (let i = 0; i < hand.length; i++) {
                const value = this.getCardValue(hand[i]);
                if (value > bestValue) {
                    bestValue = value;
                    bestCardIndex = i;
                }
            }
        }

        return bestCardIndex;
    }

    /**
     * Chooses a card when following other players in a trick
     */
    private chooseFollowingCard(hand: Card[], currentTrick: Trick, trumpSuit: Suit | null): number {
        const leadSuit = currentTrick.leadSuit;
        const hasLeadSuit = hand.some(card => card.suit === leadSuit);
        const highestInTrick = this.getHighestCardInTrick(currentTrick, trumpSuit);

        if (hasLeadSuit) {
            // We must follow suit
            return this.chooseCardInSuit(hand, leadSuit, highestInTrick, trumpSuit);
        } else {
            // Can play any card
            return this.chooseDiscardCard(hand, trumpSuit);
        }
    }

    /**
     * Chooses a card when we must follow suit
     */
    private chooseCardInSuit(hand: Card[], suit: Suit, highestInTrick: Card | null, trumpSuit: Suit | null): number {
        const cardsInSuit = hand.filter(card => card.suit === suit);
        let bestCardIndex = -1;
        let bestValue = -1;

        // If we can beat the highest card in the trick, do so
        if (highestInTrick) {
            for (let i = 0; i < cardsInSuit.length; i++) {
                const value = this.getCardValue(cardsInSuit[i]);
                if (value > this.getCardValue(highestInTrick)) {
                    if (value > bestValue) {
                        bestValue = value;
                        bestCardIndex = hand.indexOf(cardsInSuit[i]);
                    }
                }
            }
        }

        // If we can't beat the highest card, play our lowest card
        if (bestCardIndex === -1) {
            let lowestValue = 15; // Higher than any card value
            for (let i = 0; i < cardsInSuit.length; i++) {
                const value = this.getCardValue(cardsInSuit[i]);
                if (value < lowestValue) {
                    lowestValue = value;
                    bestCardIndex = hand.indexOf(cardsInSuit[i]);
                }
            }
        }

        return bestCardIndex;
    }

    /**
     * Chooses a card to discard when we can't follow suit
     */
    private chooseDiscardCard(hand: Card[], trumpSuit: Suit | null): number {
        // Strategy: Play lowest non-trump card if possible
        let bestCardIndex = 0;
        let bestValue = 15; // Higher than any card value

        for (let i = 0; i < hand.length; i++) {
            const card = hand[i];
            // Skip trump cards if possible
            if (trumpSuit && card.suit === trumpSuit) continue;

            const value = this.getCardValue(card);
            if (value < bestValue) {
                bestValue = value;
                bestCardIndex = i;
            }
        }

        // If we only have trump cards, play the lowest one
        if (bestValue === 15) {
            bestValue = 15;
            for (let i = 0; i < hand.length; i++) {
                const value = this.getCardValue(hand[i]);
                if (value < bestValue) {
                    bestValue = value;
                    bestCardIndex = i;
                }
            }
        }

        return bestCardIndex;
    }

    /**
     * Gets the highest card currently in the trick
     */
    private getHighestCardInTrick(currentTrick: Trick, trumpSuit: Suit | null): Card | null {
        if (currentTrick.cards.length === 0) return null;

        let highestCard = currentTrick.cards[0];
        let highestValue = this.getCardValue(highestCard);

        for (let i = 1; i < currentTrick.cards.length; i++) {
            const card = currentTrick.cards[i];
            const value = this.getCardValue(card);

            // Trump cards beat non-trump cards
            if (trumpSuit) {
                if (card.suit === trumpSuit && highestCard.suit !== trumpSuit) {
                    highestCard = card;
                    highestValue = value;
                } else if (card.suit === highestCard.suit && value > highestValue) {
                    highestCard = card;
                    highestValue = value;
                }
            } else if (card.suit === highestCard.suit && value > highestValue) {
                highestCard = card;
                highestValue = value;
            }
        }

        return highestCard;
    }

    /**
     * Gets the numerical value of a card
     */
    private getCardValue(card: Card): number {
        const values: { [key in Rank]: number } = {
            '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
            'J': 11, 'Q': 12, 'K': 13, 'A': 14
        };
        return values[card.rank];
    }
}

// Re-export types from Game.ts
export type { Card, Suit, Rank, Trick } from './Game'; 