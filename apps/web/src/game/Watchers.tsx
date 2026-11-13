import type { SpectatorInfo } from '@cort/protocol';
import { AnimatePresence, motion } from 'motion/react';
import { Avatar } from './Avatar';
import { Reaction, isLarge } from './Sticker';
import type { Emote } from './useTable';

const SHOWN = 4;

interface WatchersProps {
    spectators: SpectatorInfo[];
    emotes: Record<number, Emote>;
    /** Our own id among them, if we are one. */
    me: number | null;
}

/** The people watching the table: a row of faces at its edge, and what they throw in. */
export function Watchers({ spectators, emotes, me }: WatchersProps) {
    if (spectators.length === 0) return null;
    const reacting = spectators.filter((spectator) => emotes[spectator.id]);
    return (
        <div className="watchers">
            <div className="watchers-reactions">
                <AnimatePresence>
                    {reacting.map((spectator) => {
                        const emote = emotes[spectator.id];
                        return (
                            <motion.div
                                key={emote.id}
                                className={`watcher-reaction ${isLarge(emote.emote) ? 'large' : ''} ${emote.sticky ? 'sticky' : ''}`}
                                initial={{ opacity: 0, x: -12, scale: 0.6 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.7 }}
                                transition={{ type: 'spring', stiffness: 480, damping: 24 }}
                            >
                                <span className="watcher-reaction-art">
                                    <Reaction value={emote.emote} />
                                </span>
                                <span className="watcher-reaction-name">{spectator.id === me ? 'вы' : spectator.name}</span>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
            <div className="watchers-row" title={`Смотрят: ${spectators.map((spectator) => spectator.name).join(', ')}`}>
                <span className="watchers-eye" aria-hidden="true">
                    👁
                </span>
                {spectators.slice(0, SHOWN).map((spectator) => (
                    <Avatar key={spectator.id} name={spectator.name} avatar={spectator.avatar} className={spectator.id === me ? 'self' : ''} />
                ))}
                {spectators.length > SHOWN && <span className="watchers-more">+{spectators.length - SHOWN}</span>}
                <span className="visually-hidden">Зрителей: {spectators.length}</span>
            </div>
        </div>
    );
}
