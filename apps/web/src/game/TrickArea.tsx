import { cardId, type Play, type Seat } from '@cort/engine';
import { AnimatePresence, motion } from 'motion/react';
import { CardFace } from './Card';
import { positionOf, seatOrigin, trickSlot, type Layout, type Point } from './layout';

export interface CardOrigin extends Point {
    id: string;
    rotate: number;
}

interface TrickAreaProps {
    plays: Play[];
    mySeat: Seat;
    collectTo: Seat | null;
    layout: Layout;
    /** Where our own card was in the hand when we played it. */
    myOrigin: CardOrigin | null;
}

/** Cards in the middle of the table. Renders around a zero-size anchor at the table centre. */
export function TrickArea({ plays, mySeat, collectTo, layout, myOrigin }: TrickAreaProps) {
    const { cardW, cardH } = layout;
    const exitTo = collectTo === null ? { x: 0, y: 0 } : seatOrigin(positionOf(collectTo, mySeat), layout);

    return (
        <AnimatePresence custom={exitTo}>
            {plays.map((play, index) => {
                const id = cardId(play.card);
                const position = positionOf(play.seat, mySeat);
                const slot = trickSlot(position, layout);
                const from = seatOrigin(position, layout);
                const initial =
                    myOrigin?.id === id
                        ? { x: myOrigin.x, y: myOrigin.y, rotate: myOrigin.rotate, scale: 1, opacity: 1 }
                        : { x: from.x, y: from.y, rotate: slot.rotate * 4, scale: 0.7, opacity: 0 };
                return (
                    <motion.div
                        key={id}
                        className="trick-card"
                        style={{ width: cardW, height: cardH, left: -cardW / 2, top: -cardH / 2, zIndex: index }}
                        custom={exitTo}
                        variants={{
                            rest: { ...slot, scale: 1, opacity: 1 },
                            gone: (to: Point) => ({
                                x: to.x * 0.8,
                                y: to.y * 0.8,
                                scale: 0.45,
                                opacity: 0,
                                transition: { duration: 0.42, ease: 'easeIn' },
                            }),
                        }}
                        initial={initial}
                        animate="rest"
                        exit="gone"
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    >
                        <CardFace card={play.card} />
                    </motion.div>
                );
            })}
        </AnimatePresence>
    );
}
