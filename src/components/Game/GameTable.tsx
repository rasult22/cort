import React from 'react';
import { GameEngine } from '../../game/core/Game';

interface GameTableProps {
    game: GameEngine;
    onPlayCard: (playerId: number, cardIndex: number) => void;
    onSetTrump: (suit: 'hearts' | 'diamonds' | 'clubs' | 'spades') => void;
}

export const GameTable: React.FC<GameTableProps> = ({ game, onPlayCard, onSetTrump }) => {
    const currentTrick = game.getCurrentTrick();
    const currentPlayer = game.getCurrentPlayer();
    const trumpSuit = game.getTrumpSuit();

    const renderCard = (card: { suit: string; rank: string }) => {
        const suitSymbols: Record<string, string> = {
            'hearts': '♥',
            'diamonds': '♦', 
            'clubs': '♣',
            'spades': '♠'
        };
        const color = card.suit === 'hearts' || card.suit === 'diamonds' ? 'red' : 'black';
        return (
            <span style={{color}}>
                {card.rank}{suitSymbols[card.suit]}
            </span>
        );
    };

    const renderPlayerHand = (playerId: number) => {
        const hand = game.getPlayerHand(playerId);
        return (
            <div className="flex gap-2">
                {hand.map((card, index) => (
                    <button
                        key={index}
                        onClick={() => onPlayCard(playerId, index)}
                        disabled={playerId !== currentPlayer}
                        style={{ fontSize: '15px', backgroundColor: 'white' }}
                        className={`px-3 py-1 rounded ${
                            playerId === currentPlayer
                                ? 'bg-blue-500 text-white  hover:bg-blue-600'
                                : 'bg-gray-300 text-gray-600'
                        }`}
                    >
                        {renderCard(card)}
                    </button>
                ))}
            </div>
        );
    };

    const renderTrick = () => {
        if (!currentTrick) return null;

        return (
            <div className="grid grid-cols-2 gap-4 p-4 bg-white rounded text-black">
                <div className="col-span-2 text-center font-bold mb-2">Current Trick</div>
                {currentTrick.cards.map((card, index) => (
                    <div key={index} className="text-center">
                        Player {index}: {renderCard(card)}
                    </div>
                ))}
                {currentTrick.winner !== -1 && (
                    <div className="col-span-2 text-center text-green-600 font-bold">
                        Winner: Player {currentTrick.winner}
                    </div>
                )}
            </div>
        );
    };

    const renderTrumpSelection = () => {
        if (trumpSuit) return null;

        return (
            <div className="p-4 bg-yellow-100 text-black rounded">
                <div className="font-bold mb-2">Select Trump Suit</div>
                <div className="flex gap-2">
                    {(['hearts', 'diamonds', 'clubs', 'spades'] as const).map((suit) => (
                        <button
                            key={suit}
                            onClick={() => onSetTrump(suit)}
                            className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                        >
                            {suit.charAt(0).toUpperCase() + suit.slice(1)}
                        </button>
                    ))}
                </div>
            </div>
        );
    };

    const renderPlayerStats = (playerId: number) => {
        const tricks = game.getPlayerTricks(playerId);
        return (
            <div className="text-center">
                <div className="font-bold">Player {playerId}</div>
                <div>Tricks: {tricks}</div>
                <div className="text-sm text-gray-500">
                    {playerId === currentPlayer ? '(Current Turn)' : ''}
                </div>
            </div>
        );
    };

    return (
        <div className="p-4 max-w-4xl mx-auto">
            <div className="grid grid-cols-2 gap-4 mb-4">
                {[0, 1, 2, 3].map((playerId) => renderPlayerStats(playerId))}
            </div>

            {renderTrumpSelection()}

            {renderTrick()}

            <div className="mt-4">
                <div className="font-bold mb-2">Player Hands</div>
                <div>
                    {[0, 1, 2, 3].map((playerId) => (
                        <div key={playerId}>
                            <div className="font-bold mb-2">Player {playerId}</div>
                            {renderPlayerHand(playerId)}
                        </div>
                    ))}
                </div>
            </div>

            {trumpSuit && (
                <div className="mt-4 text-center text-lg font-bold text-red-600">
                    Trump Suit: {trumpSuit.charAt(0).toUpperCase() + trumpSuit.slice(1)}
                </div>
            )}
        </div>
    );
}; 