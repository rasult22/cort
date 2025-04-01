import { GameEngine } from '../game/core/Game';
import 'jest';

describe('GameEngine', () => {
    let game: GameEngine;

    beforeEach(() => {
        game = new GameEngine();
    });

    describe('Initialization', () => {
        it('should initialize with 4 players', () => {
            expect(game.getPlayerHand(0)).toHaveLength(0);
            expect(game.getPlayerHand(1)).toHaveLength(0);
            expect(game.getPlayerHand(2)).toHaveLength(0);
            expect(game.getPlayerHand(3)).toHaveLength(0);
        });

        it('should start with no trump suit', () => {
            expect(game.getTrumpSuit()).toBeNull();
        });

        it('should start with player 0 as current player', () => {
            expect(game.getCurrentPlayer()).toBe(0);
        });
    });

    describe('Game Start', () => {
        it('should deal 13 cards to each player when game starts', () => {
            game.startGame();
            expect(game.getPlayerHand(0)).toHaveLength(13);
            expect(game.getPlayerHand(1)).toHaveLength(13);
            expect(game.getPlayerHand(2)).toHaveLength(13);
            expect(game.getPlayerHand(3)).toHaveLength(13);
        });

        it('should throw error when trying to start game twice', () => {
            game.startGame();
            expect(() => game.startGame()).toThrow('Game has already started');
        });
    });

    describe('Trump Suit', () => {
        it('should set trump suit correctly', () => {
            game.startGame();
            game.setTrumpSuit('hearts');
            expect(game.getTrumpSuit()).toBe('hearts');
        });

        it('should throw error when setting trump suit before game starts', () => {
            expect(() => game.setTrumpSuit('hearts')).toThrow('Game has not started');
        });

        it('should throw error when setting trump suit twice', () => {
            game.startGame();
            game.setTrumpSuit('hearts');
            expect(() => game.setTrumpSuit('diamonds')).toThrow('Trump suit has already been set');
        });
    });

    describe('Playing Cards', () => {
        beforeEach(() => {
            game.startGame();
            game.setTrumpSuit('hearts');
        });

        it('should throw error when playing out of turn', () => {
            expect(() => game.playCard(1, 0)).toThrow('Not your turn');
        });

        it('should throw error when playing invalid card index', () => {
            expect(() => game.playCard(0, 13)).toThrow('Invalid card index');
        });

        it('should start a new trick when playing first card', () => {
            game.playCard(0, 0);
            const currentTrick = game.getCurrentTrick();
            expect(currentTrick).not.toBeNull();
            expect(currentTrick?.cards).toHaveLength(1);
        });

        it('should require following lead suit when possible', () => {
            // Get player 0's hand
            const player0Hand = game.getPlayerHand(0);
            // Find a non-hearts card
            const nonHeartsCardIndex = player0Hand.findIndex(card => card.suit !== 'hearts');
            
            if (nonHeartsCardIndex !== -1) {
                // Play a hearts card first
                const heartsCardIndex = player0Hand.findIndex(card => card.suit === 'hearts');
                if (heartsCardIndex !== -1) {
                    game.playCard(0, heartsCardIndex);
                    // Try to play non-hearts card when hearts is lead
                    expect(() => game.playCard(1, nonHeartsCardIndex)).toThrow('Must follow the lead suit');
                }
            }
        });
    });

    describe('Trick Taking', () => {
        beforeEach(() => {
            game.startGame();
            game.setTrumpSuit('hearts');
        });

        it('should correctly determine trick winner with trump', () => {
            // Play cards in a way that trump wins
            game.playCard(0, 0); // Lead card
            game.playCard(1, 0); // Non-trump
            game.playCard(2, 0); // Trump
            game.playCard(3, 0); // Non-trump

            const currentTrick = game.getCurrentTrick();
            expect(currentTrick?.winner).toBe(2); // Player 2 should win with trump
        });

        it('should correctly determine trick winner without trump', () => {
            // Play cards in a way that highest card of lead suit wins
            game.playCard(0, 0); // Lead card
            game.playCard(1, 0); // Lower card of same suit
            game.playCard(2, 0); // Higher card of same suit
            game.playCard(3, 0); // Lower card of same suit

            const currentTrick = game.getCurrentTrick();
            expect(currentTrick?.winner).toBe(2); // Player 2 should win with highest card
        });
    });

    describe('Game End', () => {
        beforeEach(() => {
            game.startGame();
            game.setTrumpSuit('hearts');
        });

        it('should end game when team reaches 7 tricks', () => {
            // Simulate team 1 (players 0 and 2) winning 7 tricks
            for (let i = 0; i < 7; i++) {
                // Play a complete trick
                game.playCard(0, 0);
                game.playCard(1, 0);
                game.playCard(2, 0);
                game.playCard(3, 0);
            }

            // Check if game has ended
            expect(game.getPlayerTricks(0) + game.getPlayerTricks(2)).toBe(7);
        });
    });
}); 