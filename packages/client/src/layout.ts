import type { Seat } from '@cort/engine';

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

/** Card size and screen class for a screen of the given size, in CSS pixels / density-independent points. */
export function measureLayout(width: number, height: number): Layout {
    const cardW = Math.round(Math.max(50, Math.min(width * 0.17, height * 0.135, 104)));
    return { width, height, cardW, cardH: Math.round(cardW * 1.4), compact: width < 700 };
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

/** Where each card of a hand of `count` sits in the fan along the bottom edge. */
export function fanSlot(index: number, count: number, layout: Layout): { x: number; y: number; rotate: number } {
    const { cardW } = layout;
    const available = Math.min(layout.width - (layout.compact ? 44 : 20), 860) - cardW;
    const spacing = count > 1 ? Math.min(cardW * 0.6, available / (count - 1)) : 0;
    // Narrow screens get a flatter fan, so the outer cards stay on screen.
    const tilt = layout.compact ? 1.3 : 2.2;
    const curve = (layout.compact ? 0.6 : 1) * (cardW / 120);
    const offset = index - (count - 1) / 2;
    return { x: offset * spacing, y: offset * offset * curve, rotate: offset * tilt };
}
