import React, { useState, useEffect } from 'react';
import { GameEngine } from '../../game/core/Game';
import { GameTable } from './GameTable';

export const GameContainer: React.FC = () => {
    const [game] = useState(() => new GameEngine());
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        try {
            game.startGame();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start game');
        }
    }, [game]);

    const handlePlayCard = (playerId: number, cardIndex: number) => {
        try {
            game.playCard(playerId, cardIndex);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid move');
        }
    };

    const handleSetTrump = (suit: 'hearts' | 'diamonds' | 'clubs' | 'spades') => {
        try {
            game.setTrumpSuit(suit);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to set trump suit');
        }
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

                <GameTable
                    game={game}
                    onPlayCard={handlePlayCard}
                    onSetTrump={handleSetTrump}
                />
            </div>
        </div>
    );
}; 