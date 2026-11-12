import type { Seat } from '@cort/engine';
import { useEffect, useState } from 'react';

/** Where a seat is drawn, relative to the player looking at the screen. */
export type Position = 'bottom' | 'left' | 'top' | 'right';

/**
 * Turn order is drawn clockwise: the next player sits to our left.
 * (Direction of play is an open rules question — docs/RULES.md, В4.)
 */
const POSITIONS: Position[] = ['bottom', 'left', 'top', 'right'];

export const positionOf = (seat: Seat, mySeat: Seat): Position => POSITIONS[(seat - mySeat + 4) % 4];

export interface Layout {
    width: number;
    height: number;
    cardW: number;
    cardH: number;
    /** Phones and other narrow screens. */
    compact: boolean;
}

function measure(): Layout {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const cardW = Math.round(Math.max(50, Math.min(width * 0.17, height * 0.135, 104)));
    return { width, height, cardW, cardH: Math.round(cardW * 1.4), compact: width < 700 };
}

export function useLayout(): Layout {
    const [layout, setLayout] = useState(measure);
    useEffect(() => {
        const update = () => setLayout(measure());
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);
    return layout;
}

export interface Point {
    x: number;
    y: number;
}

/** Offset from the table centre to where a seat's cards come from and go to. */
export function seatOrigin(position: Position, layout: Layout): Point {
    const dx = Math.min(layout.width * 0.44, 520);
    switch (position) {
        case 'bottom':
            return { x: 0, y: layout.height * 0.42 };
        case 'top':
            return { x: 0, y: -layout.height * 0.34 };
        case 'left':
            return { x: -dx, y: 0 };
        case 'right':
            return { x: dx, y: 0 };
    }
}

/** Where a seat's card rests in the middle of the table. */
export function trickSlot(position: Position, layout: Layout): Point & { rotate: number } {
    const d = layout.cardW * 0.8;
    switch (position) {
        case 'bottom':
            return { x: 0, y: d * 0.8, rotate: -3 };
        case 'top':
            return { x: 0, y: -d * 0.8, rotate: 2 };
        case 'left':
            return { x: -d, y: 0, rotate: 6 };
        case 'right':
            return { x: d, y: 0, rotate: -6 };
    }
}
