# GameEngine Documentation

## Overview
The `GameEngine` class implements a card game engine that supports a 4-player trick-taking card game. It manages the game state, including deck management, player hands, trick taking, and game progression.

## Types

### Card Types
```typescript
type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

interface Card {
    suit: Suit;
    rank: Rank;
}
```

### Player Interface
```typescript
interface Player {
    id: number;
    hand: Card[];
    tricks: number;
}
```

### Trick Interface
```typescript
interface Trick {
    cards: Card[];
    winner: number;
    leadSuit: Suit;
}
```

## Class Methods

### Constructor
```typescript
constructor()
```
Initializes a new game with:
- A shuffled deck of 52 cards
- 4 players with empty hands
- No current trick
- No trump suit
- Starting player index at 0
- Game not started

### Public Methods

#### startGame()
```typescript
public startGame(): void
```
- Deals 13 cards to each player
- Sets gameStarted to true
- Throws error if game has already started

#### setTrumpSuit(suit: Suit)
```typescript
public setTrumpSuit(suit: Suit): void
```
- Sets the trump suit for the current game
- Throws error if:
  - Game hasn't started
  - Trump suit already set

#### playCard(playerId: number, cardIndex: number)
```typescript
public playCard(playerId: number, cardIndex: number): void
```
- Plays a card from a player's hand
- Validates:
  - Game has started
  - It's the player's turn
  - Card index is valid
  - Player follows lead suit if required
- Manages trick progression
- Determines trick winner when complete
- Throws appropriate errors for invalid moves

### Utility Methods

#### getPlayerHand(playerId: number)
```typescript
public getPlayerHand(playerId: number): Card[]
```
Returns the current hand of the specified player

#### getCurrentTrick()
```typescript
public getCurrentTrick(): Trick | null
```
Returns the current trick or null if no trick is in progress

#### getCurrentPlayer()
```typescript
public getCurrentPlayer(): number
```
Returns the index of the current player

#### getTrumpSuit()
```typescript
public getTrumpSuit(): Suit | null
```
Returns the current trump suit or null if not set

#### getPlayerTricks(playerId: number)
```typescript
public getPlayerTricks(playerId: number): number
```
Returns the number of tricks won by the specified player

## Game Rules

1. The game is played with 4 players
2. Each player receives 13 cards at the start
3. A trump suit must be set before play begins
4. Players must follow the lead suit if possible
5. A trick is won by:
   - Highest trump card if any trump is played
   - Highest card of the lead suit if no trump is played
6. The game ends when either team reaches 7 tricks
7. Teams are:
   - Team 1: Players 0 and 2
   - Team 2: Players 1 and 3

## Usage Example

```typescript
// Create a new game
const game = new GameEngine();

// Start the game
game.startGame();

// Set trump suit
game.setTrumpSuit('hearts');

// Play cards (example)
game.playCard(0, 0); // Player 0 plays their first card
game.playCard(1, 2); // Player 1 plays their third card
game.playCard(2, 1); // Player 2 plays their second card
game.playCard(3, 0); // Player 3 plays their first card

// Check game state
const currentTrick = game.getCurrentTrick();
const playerHand = game.getPlayerHand(0);
const currentPlayer = game.getCurrentPlayer();
```

## Error Handling

The class implements comprehensive error handling for:
- Invalid game states
- Out-of-turn plays
- Invalid card indices
- Suit following violations
- Invalid game progression

All errors are thrown with descriptive messages to help identify the issue. 