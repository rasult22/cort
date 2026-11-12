import type { Suit } from '@cort/engine';
import type { SeatInfo } from '@cort/protocol';
import { AnimatePresence, motion } from 'motion/react';
import { CardBack, SuitIcon, isRed } from './Card';
import type { Position } from './layout';
import type { Emote } from './useTable';

interface PlayerPlateProps {
    info: SeatInfo;
    position: Position;
    cards: number;
    active: boolean;
    /** Set when this player named trump this hand. */
    isCaller: boolean;
    trump: Suit | null;
    partner: boolean;
    emote?: Emote;
}

const MAX_FAN = 13;

/** An opponent or partner: avatar, name, and their face-down cards. */
export function PlayerPlate({ info, position, cards, active, isCaller, trump, partner, emote }: PlayerPlateProps) {
    return (
        <div className={`plate plate-${position} ${active ? 'active' : ''} ${info.connected ? '' : 'offline'}`}>
            <div className="plate-avatar">
                <span>{info.name.slice(0, 1).toUpperCase()}</span>
                {isCaller && (
                    <div className={`plate-caller ${trump && isRed(trump) ? 'red' : ''}`} title="Заказывает козырь">
                        {trump ? <SuitIcon suit={trump} /> : '♛'}
                    </div>
                )}
                <AnimatePresence>
                    {emote && (
                        <motion.div
                            key={emote.id}
                            className="emote-bubble"
                            initial={{ scale: 0.3, opacity: 0, y: 8 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.6, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                        >
                            {emote.emote}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <div className="plate-name">
                {info.name}
                {partner && <span className="plate-tag">напарник</span>}
                {info.kind === 'bot' && <span className="plate-tag">бот</span>}
            </div>
            <div className="plate-fan" style={{ ['--n' as string]: Math.min(cards, MAX_FAN) }}>
                {Array.from({ length: Math.min(cards, MAX_FAN) }, (_, i) => (
                    <div key={i} className="plate-fan-card" style={{ ['--i' as string]: i }}>
                        <CardBack />
                    </div>
                ))}
            </div>
        </div>
    );
}
