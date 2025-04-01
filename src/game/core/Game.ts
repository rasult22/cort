// Types
type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

interface Card {
    suit: Suit;
    rank: Rank;
}

interface Player {
    id: number;
    name: string;
    hand: Card[];
    tricks: number;
}

interface Trick {
    cards: Card[];
    winner: number;
    leadSuit: Suit;
    playerIds: number[]; // Track which player played each card
}

/**
 * GameEngine implements a 4-player trick-taking card game.
 * 
 * Game Rules:
 * - 4 players in 2 teams (players 0,2 vs 1,3)
 * - Each player gets 13 cards
 * - Game is played in 13 tricks
 * - First player of each trick sets the lead suit
 * - Players must follow the lead suit if they have it
 * - If a player doesn't have the lead suit, they can play any card
 * - Trump suit, if set, beats all other suits
 * - Within the same suit, higher rank wins
 * - Winner of a trick leads the next trick
 * - First team to win 7 tricks wins the game
 */
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
            { id: 0, name: 'North', hand: [], tricks: 0 },
            { id: 1, name: 'East', hand: [], tricks: 0 },
            { id: 2, name: 'South', hand: [], tricks: 0 },
            { id: 3, name: 'West', hand: [], tricks: 0 }
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

    /**
     * Starts a new game by dealing 13 cards to each player.
     * Must be called before any other game actions.
     * @throws Error if game has already started
     */
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

    /**
     * Sets the trump suit for the game. Once set, it cannot be changed.
     * Trump suit cards beat all other suits in tricks.
     * @param suit The suit to set as trump
     * @throws Error if game hasn't started or trump suit already set
     */
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

    /**
     * Plays a card from a player's hand.
     * Rules enforced:
     * - Must be player's turn
     * - Must follow lead suit if possible
     * - First card of trick sets lead suit
     * @param playerId The ID of the player playing the card (0-3)
     * @param cardIndex Index of the card in player's hand to play
     * @throws Error if not player's turn, invalid card, or breaking lead suit rule
     */
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

        // Start new trick if needed
        if (!this.currentTrick || this.currentTrick.cards.length === 4) {
            this.currentTrick = {
                cards: [],
                winner: -1,
                leadSuit: card.suit,
                playerIds: []
            };
        } else {
            // Check if following suit is required
            const hasLeadSuit = player.hand.some(c => c.suit === this.currentTrick!.leadSuit);
            if (hasLeadSuit && card.suit !== this.currentTrick.leadSuit) {
                throw new Error('Must follow the lead suit');
            }
        }

        // Play the card
        this.currentTrick.cards.push(card);
        this.currentTrick.playerIds.push(playerId);
        player.hand.splice(cardIndex, 1);

        // If trick is complete, determine winner
        if (this.currentTrick.cards.length === 4) {
            this.determineTrickWinner();
            // Don't advance turn here since determineTrickWinner sets it to the winner
        } else {
            // Only advance to next player if trick isn't complete
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 4;
        }
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

    /**
     * Gets the current hand of cards for a player
     * @param playerId The ID of the player (0-3)
     * @returns Array of cards in the player's hand
     */
    public getPlayerHand(playerId: number): Card[] {
        return this.players[playerId].hand;
    }

    /**
     * Gets the current trick in play
     * @returns Current trick or null if no trick is in progress
     */
    public getCurrentTrick(): Trick | null {
        return this.currentTrick;
    }

    /**
     * Gets the ID of the player whose turn it is
     * @returns Player ID (0-3)
     */
    public getCurrentPlayer(): number {
        return this.currentPlayerIndex;
    }

    /**
     * Gets the current trump suit
     * @returns Trump suit or null if not set
     */
    public getTrumpSuit(): Suit | null {
        return this.trumpSuit;
    }

    /**
     * Gets the number of tricks won by a player
     * @param playerId The ID of the player (0-3)
     * @returns Number of tricks won by the player
     */
    public getPlayerTricks(playerId: number): number {
        return this.players[playerId].tricks;
    }

    /**
     * Gets the name of a player
     * @param playerId The ID of the player (0-3)
     * @returns Name of the player
     */
    public getPlayerName(playerId: number): string {
        return this.players[playerId].name;
    }
}

// Make the Game class available globally
declare global {
    interface Window {
        game: GameEngine;
    }
}

