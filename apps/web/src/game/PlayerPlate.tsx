import type { TurnClock } from '@cort/client';
import type { Suit } from '@cort/engine';
import type { SeatInfo } from '@cort/protocol';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo } from 'react';
import { Avatar } from './Avatar';
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
    /** The clock on this player's move, while they are being timed. */
    clock?: TurnClock | null;
    /** Offered to a spectator on a seat a bot is playing. */
    onSit?: () => void;
}

const MAX_FAN = 13;

/**
 * The time left for a move, as a ring that runs out. Drawn once per move and
 * left to the browser to animate, so it stays smooth while React is busy.
 */
export function ClockRing({ clock }: { clock: TurnClock }) {
    // How far into the move we already are. Measured once: the animation keeps its own time after that.
    const elapsed = useMemo(() => Math.max(0, clock.total - (clock.endsAt - Date.now())), [clock.endsAt, clock.total]);
    return (
        <svg key={clock.endsAt} className="clock-ring" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="18.500" pathLength="100" style={{ animationDuration: `${clock.total}ms`, animationDelay: `${-elapsed}ms` }} />
        </svg>
    );
}

/** Another player at the table: avatar, name, and their face-down cards. */
export function PlayerPlate({ info, position, cards, active, isCaller, trump, partner, emote, clock, onSit }: PlayerPlateProps) {
    // A person who dropped out mid-game: a bot is playing their cards until they return.
    const covered = info.kind === 'human' && !info.connected;
    const tag = covered ? 'вышел · играет бот' : info.idle ? 'долго думает' : partner ? 'напарник' : info.kind === 'bot' ? 'бот' : null;
    return (
        <div className={`plate plate-${position} ${active ? 'active' : ''} ${info.connected ? '' : 'offline'}`}>
            <div className="plate-avatar">
                <Avatar name={info.name} avatar={info.avatar} />
                {clock && <ClockRing clock={clock} />}
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
                            className={`emote-bubble ${isLarge(emote.emote) ? 'sticker-bubble' : ''} ${emote.sticky ? 'sticky' : ''}`}
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
            {onSit && (
                <button type="button" className="plate-sit" onClick={onSit}>
                    Сесть
                </button>
            )}
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
