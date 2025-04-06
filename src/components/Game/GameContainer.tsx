import React, { useState, useEffect } from 'react';
import { GameEngine } from '../../game/core/Game';
import { GameTable } from './GameTable';

export const GameContainer: React.FC = () => {
    const [game] = useState(() => new GameEngine());
    const [error, setError] = useState<string | null>(null);
    const [aiPlayers, setAiPlayers] = useState<boolean[]>([false, false, false, false]);
    const [gameState, setGameState] = useState(0);

    useEffect(() => {
        try {
            game.startGame();
            setGameState(prev => prev + 1);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start game');
        }
    }, [game]);

    const handlePlayCard = (playerId: number, cardIndex: number) => {
        try {
            game.playCard(playerId, cardIndex);
            setError(null);
            setGameState(prev => prev + 1);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid move');
        }
    };

    const handleSetTrump = (suit: 'hearts' | 'diamonds' | 'clubs' | 'spades') => {
        try {
            game.setTrumpSuit(suit);
            setError(null);
            setGameState(prev => prev + 1);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to set trump suit');
        }
    };

    const toggleAI = (playerId: number) => {
        setAiPlayers(prev => {
            const newAiPlayers = [...prev];
            newAiPlayers[playerId] = !newAiPlayers[playerId];
            return newAiPlayers;
        });
    };

    return (
        <div className="min-h-screen">
            <div className="container mx-auto py-8">
                <h1 className="text-3xl font-bold text-center mb-8">Card Game</h1>
                
                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                        {error}
                    </div>
                )}

                <div className="mb-4">
                    <h2 className="text-xl font-bold mb-2">AI Controls</h2>
                    <div className="grid grid-cols-4 gap-4">
                        {[0, 1, 2, 3].map((playerId) => (
                            <div key={playerId} className="flex items-center">
                                <input
                                    type="checkbox"
                                    id={`ai-player-${playerId}`}
                                    checked={aiPlayers[playerId]}
                                    onChange={() => toggleAI(playerId)}
                                    className="mr-2"
                                />
                                <label htmlFor={`ai-player-${playerId}`}>
                                    {game.getPlayerName(playerId)} (Player {playerId})
                                </label>
                            </div>
                        ))}
                    </div>
                </div>

                <GameTable
                    game={game}
                    onPlayCard={handlePlayCard}
                    onSetTrump={handleSetTrump}
                    aiPlayers={aiPlayers}
                    gameState={gameState}
                />
            </div>
        </div>
    );
}; 