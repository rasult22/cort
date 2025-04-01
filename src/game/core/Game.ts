// Types
type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

interface Card {
    suit: Suit;
    rank: Rank;
}

interface Player {
    id: number;
    hand: Card[];
    tricks: number;
}

interface Trick {
    cards: Card[];
    winner: number;
    leadSuit: Suit;
}

export class GameEngine {
    private deck: Card[];
    private players: Player[];
    private currentTrick: Trick | null;
    private trumpSuit: Suit | null;
    private currentPlayerIndex: number;
    private gameStarted: boolean;

    constructor() {
        this.deck = this.createDeck();
        this.players = [
            { id: 0, hand: [], tricks: 0 },
            { id: 1, hand: [], tricks: 0 },
            { id: 2, hand: [], tricks: 0 },
            { id: 3, hand: [], tricks: 0 }
        ];
        this.currentTrick = null;
        this.trumpSuit = null;
        this.currentPlayerIndex = 0;
        this.gameStarted = false;
    }

    private createDeck(): Card[] {
        const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
        const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        const deck: Card[] = [];

        for (const suit of suits) {
            for (const rank of ranks) {
                deck.push({ suit, rank });
            }
        }

        return this.shuffleDeck(deck);
    }

    private shuffleDeck(deck: Card[]): Card[] {
        const shuffled = [...deck];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    public startGame(): void {
        if (this.gameStarted) {
            throw new Error('Game has already started');
        }

        // Deal 13 cards to each player
        for (let i = 0; i < 13; i++) {
            for (let j = 0; j < 4; j++) {
                const card = this.deck.pop();
                if (card) {
                    this.players[j].hand.push(card);
                }
            }
        }

        this.gameStarted = true;
        console.log('Game started! Each player has 13 cards.');
    }

    public setTrumpSuit(suit: Suit): void {
        if (!this.gameStarted) {
            throw new Error('Game has not started');
        }
        if (this.trumpSuit) {
            throw new Error('Trump suit has already been set');
        }
        this.trumpSuit = suit;
        console.log(`Trump suit set to: ${suit}`);
    }

    public playCard(playerId: number, cardIndex: number): void {
        if (!this.gameStarted) {
            throw new Error('Game has not started');
        }
        if (playerId !== this.currentPlayerIndex) {
            throw new Error('Not your turn');
        }

        const player = this.players[playerId];
        if (cardIndex < 0 || cardIndex >= player.hand.length) {
            throw new Error('Invalid card index');
        }

        const card = player.hand[cardIndex];

        // Check if following suit is required
        if (this.currentTrick && this.currentTrick.cards.length > 0) {
            const leadSuit = this.currentTrick.leadSuit;
            const hasLeadSuit = player.hand.some(c => c.suit === leadSuit);
            if (hasLeadSuit && card.suit !== leadSuit) {
                throw new Error('Must follow the lead suit');
            }
        }

        // Start new trick if needed
        if (!this.currentTrick || this.currentTrick.cards.length === 4) {
            this.currentTrick = {
                cards: [],
                winner: -1,
                leadSuit: card.suit
            };
        }

        // Play the card
        this.currentTrick.cards.push(card);
        player.hand.splice(cardIndex, 1);

        // If trick is complete, determine winner
        if (this.currentTrick.cards.length === 4) {
            this.determineTrickWinner();
        }

        // Move to next player
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 4;
    }

    private determineTrickWinner(): void {
        if (!this.currentTrick || this.currentTrick.cards.length !== 4) {
            throw new Error('Cannot determine winner of incomplete trick');
        }

        const leadSuit = this.currentTrick.leadSuit;
        let winningCard = this.currentTrick.cards[0];
        let winningIndex = 0;

        for (let i = 1; i < 4; i++) {
            const card = this.currentTrick.cards[i];
            if (card.suit === this.trumpSuit && winningCard.suit !== this.trumpSuit) {
                winningCard = card;
                winningIndex = i;
            } else if (card.suit === winningCard.suit) {
                if (this.getCardValue(card) > this.getCardValue(winningCard)) {
                    winningCard = card;
                    winningIndex = i;
                }
            }
        }

        this.currentTrick.winner = winningIndex;
        this.players[winningIndex].tricks++;
        this.currentPlayerIndex = winningIndex;

        console.log(`Trick won by player ${winningIndex}`);
        this.checkGameEnd();
    }

    private getCardValue(card: Card): number {
        const values: { [key in Rank]: number } = {
            '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
            'J': 11, 'Q': 12, 'K': 13, 'A': 14
        };
        return values[card.rank];
    }

    private checkGameEnd(): void {
        const team1Tricks = this.players[0].tricks + this.players[2].tricks;
        const team2Tricks = this.players[1].tricks + this.players[3].tricks;

        if (team1Tricks >= 7) {
            console.log('Team 1 wins the game!');
            this.gameStarted = false;
        } else if (team2Tricks >= 7) {
            console.log('Team 2 wins the game!');
            this.gameStarted = false;
        }
    }

    // Utility methods for console interaction
    public getPlayerHand(playerId: number): Card[] {
        return this.players[playerId].hand;
    }

    public getCurrentTrick(): Trick | null {
        return this.currentTrick;
    }

    public getCurrentPlayer(): number {
        return this.currentPlayerIndex;
    }

    public getTrumpSuit(): Suit | null {
        return this.trumpSuit;
    }

    public getPlayerTricks(playerId: number): number {
        return this.players[playerId].tricks;
    }
}

// Make the Game class available globally
declare global {
    interface Window {
        game: GameEngine;
    }
}

