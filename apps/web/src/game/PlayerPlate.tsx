import type { Suit } from '@cort/engine';
import type { SeatInfo } from '@cort/protocol';
import { AnimatePresence, motion } from 'motion/react';
import { CardBack, SuitIcon, isRed } from './Card';
import type { Position } from './layout';
import { Reaction, isLarge } from './Sticker';
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
    // A person who dropped out mid-game: a bot is playing their cards until they return.
    const covered = info.kind === 'human' && !info.connected;
    const tag = covered ? 'вышел · играет бот' : partner ? 'напарник' : info.kind === 'bot' ? 'бот' : null;
    return (
        <div className={`plate plate-${position} ${active ? 'active' : ''} ${info.connected ? '' : 'offline'}`}>
            <div className="plate-avatar">
                <span>{info.name.slice(0, 1).toUpperCase()}</span>
                {isCaller && (
                    <div className={`plate-caller ${trump && isRed(trump) ? 'red' : ''}`} title="Заказывает козырь">
                        {trump ? <SuitIcon suit={trump} /> : '♛'}
                    </div>
                )}
                {covered && (
                    <div className="plate-covered" title="Игрок вышел, за него играет бот">
                        🤖
                    </div>
                )}
                <AnimatePresence>
                    {emote && (
                        <motion.div
                            key={emote.id}
                            className={`emote-bubble ${isLarge(emote.emote) ? 'sticker-bubble' : ''}`}
                            initial={{ scale: 0.3, opacity: 0, y: 8 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.6, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                        >
                            <Reaction value={emote.emote} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <div className="plate-name">
                {info.name}
                {tag && <span className="plate-tag">{tag}</span>}
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
