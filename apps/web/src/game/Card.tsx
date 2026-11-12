import type { Card, Suit } from '@cort/engine';

const SUIT_PATHS: Record<Suit, string> = {
    hearts: 'M12 21.2s-7.6-5-9.7-9.6C.8 8.300 2.500 4.300 6.300 4.300c2.200 0 4 1.300 5.700 3.500 1.700-2.200 3.500-3.500 5.700-3.500 3.800 0 5.500 4 4 7.300-2.100 4.600-9.700 9.600-9.700 9.600z',
    diamonds: 'M12 2.200 19.800 12 12 21.800 4.200 12z',
    spades: 'M12 2.200s8 5.800 9.200 10.500c.800 3.200-1.200 5.800-4.100 5.800-1.600 0-3-.700-3.900-1.900.200 2 .900 3.600 2.400 5.200H8.400c1.500-1.600 2.200-3.200 2.400-5.200-.900 1.200-2.300 1.900-3.900 1.900-2.900 0-4.900-2.600-4.100-5.800C4 8 12 2.200 12 2.200z',
    clubs: 'M12 2.400a4.500 4.500 0 0 1 3.600 7.200 4.500 4.500 0 1 1-2.500 7.500c.200 1.800.900 3.300 2.300 4.700H8.600c1.400-1.400 2.100-2.900 2.300-4.700a4.500 4.500 0 1 1-2.500-7.500A4.500 4.500 0 0 1 12 2.400z',
};

export const SUIT_NAMES: Record<Suit, string> = {
    spades: 'Пики',
    hearts: 'Червы',
    clubs: 'Трефы',
    diamonds: 'Бубны',
};

export const isRed = (suit: Suit): boolean => suit === 'hearts' || suit === 'diamonds';

export function SuitIcon({ suit, className }: { suit: Suit; className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={`suit-icon ${className ?? ''}`} aria-hidden="true">
            <path d={SUIT_PATHS[suit]} fill="currentColor" />
        </svg>
    );
}

const COURT = new Set(['J', 'Q', 'K']);

/** The face of a card. Its size comes from the `--cw` CSS variable. */
export function CardFace({ card }: { card: Card }) {
    const corner = (
        <>
            <span className="card-rank">{card.rank}</span>
            <SuitIcon suit={card.suit} />
        </>
    );
    return (
        <div className={`card card-face ${isRed(card.suit) ? 'red' : 'black'}`}>
            <div className="card-corner">{corner}</div>
            <div className={`card-center ${COURT.has(card.rank) ? 'court' : ''} ${card.rank === 'A' ? 'ace' : ''}`}>
                {COURT.has(card.rank) && <span className="card-court-letter">{card.rank}</span>}
                <SuitIcon suit={card.suit} />
            </div>
            <div className="card-corner flipped">{corner}</div>
        </div>
    );
}

export function CardBack() {
    return (
        <div className="card card-back">
            <div className="card-back-inner" />
        </div>
    );
}
