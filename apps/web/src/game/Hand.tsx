import { fanSlot } from '@cort/client';
import { cardId, sortHand, type Card } from '@cort/engine';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';
import { CardFace } from './Card';
import type { Layout } from './layout';

interface HandProps {
    cards: Card[];
    handNumber: number;
    /** Ids of cards that may be played now; null when it is not our move. */
    playable: Set<string> | null;
    layout: Layout;
    onPlay: (card: Card, element: HTMLElement) => void;
}

/** The player's own cards, fanned out along the bottom edge. */
export function Hand({ cards, handNumber, playable, layout, onPlay }: HandProps) {
    const sorted = useMemo(() => sortHand(cards), [cards]);
    const seen = useRef(new Set<string>());
    const { cardW, cardH } = layout;

    const count = sorted.length;

    // Cards we have not drawn before are being dealt: stagger their arrival.
    let fresh = 0;
    const keys = sorted.map((card) => `${handNumber}:${cardId(card)}`);
    useEffect(() => {
        seen.current = new Set(keys);
    });

    return (
        <div className="hand" style={{ height: cardH }}>
            {sorted.map((card, index) => {
                const key = keys[index];
                const slot = fanSlot(index, count, layout);
                const canPlay = playable?.has(cardId(card)) ?? false;
                const dimmed = playable !== null && !canPlay;
                const delay = seen.current.has(key) ? 0 : fresh++ * 0.05;
                const restY = slot.y - (canPlay ? cardH * 0.1 : 0);
                return (
                    <motion.button
                        key={key}
                        type="button"
                        className={`hand-card ${canPlay ? 'playable' : ''} ${dimmed ? 'dimmed' : ''}`}
                        style={{ width: cardW, height: cardH, left: `calc(50% - ${cardW / 2}px)`, zIndex: index }}
                        initial={{ x: 0, y: -layout.height * 0.42, rotate: 0, scale: 0.6, opacity: 0 }}
                        animate={{ x: slot.x, y: restY, rotate: slot.rotate, scale: 1, opacity: 1 }}
                        whileHover={canPlay ? { y: restY - cardH * 0.12 } : undefined}
                        transition={{ type: 'spring', stiffness: 420, damping: 34, delay }}
                        disabled={!canPlay}
                        aria-label={`${card.rank} ${card.suit}`}
                        onClick={(event) => onPlay(card, event.currentTarget)}
                    >
                        <CardFace card={card} />
                    </motion.button>
                );
            })}
        </div>
    );
}
