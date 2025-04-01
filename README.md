# Card Game (Whist Variant)

A multiplayer card game implementation using React and Phaser.js.

## Game Rules

- Played with a standard 52-card deck
- 4 players (2 teams of 2 players)
- Each player receives 13 cards
- Partners sit opposite each other
- First player declares trump suit and makes the first move
- Players must follow the suit of the first player
- If a player doesn't have the required suit, they can play a trump or any card
- Highest card in the trick wins
- Goal is to win 7 tricks

## Technical Architecture

### Frontend Stack
- React.js for UI components
- Zustand for game state management.
- Phaser.js for game rendering and animations
- TypeScript for type safety and better development experience
- The game logic must be separated from react and ui. Meaning that it should be generic to any framework. And it should be in different files.

### Project Structure
```
src/
├── components/         # React components
│   ├── Game/          # Main game component
│   ├── Lobby/         # Game lobby
│   └── UI/            # Reusable UI components
├── game/              # Phaser game implementation
│   ├── scenes/        # Game scenes
│   ├── sprites/       # Card and game object sprites
│   └── config/        # Phaser configuration
├── store/             # Zustand store
│   └── types/         # TypeScript types
└── utils/             # Utility functions
```

## Implementation Plan

### Phase 1: Basic Setup
1. We already have react + phaser project
2. Set up Phaser.js integration
3. Create basic project structure
4. Implement card assets loading system

### Phase 2: Core Game Logic
1. Implement card deck management
2. Create dealing mechanism
3. Implement trick-taking logic
4. Add trump suit selection
5. Create scoring system

### Phase 3: Game UI
1. Design and implement game board
2. Create player hands display
3. Implement card playing animations
4. Add trick display
5. Create score display

### Phase 4: Multiplayer
0. Create basic AI players
1. Set up WebSocket connection [IN THE FUTURE]
2. Implement player synchronization [IN THE FUTURE]
3. Add turn management [IN THE FUTURE]
4. Create team management [IN THE FUTURE]
5. Implement game state synchronization [IN THE FUTURE]

### Phase 5: Polish
1. Add sound effects
2. Implement animations
3. Add visual feedback
4. Create game lobby
5. Add game settings

## Development Guidelines

1. Use TypeScript for all new code
2. Follow React best practices and hooks
3. Implement proper error handling
4. Write unit tests for core game logic
5. Use CSS modules for styling
6. Follow Git flow for version control

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Start development server: `npm run dev`
4. Build for production: `npm run build`

## Dependencies

- React
- Phaser.js
- TypeScript
- Zustand
- Socket.io-client
- CSS Modules
