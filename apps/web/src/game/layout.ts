import { measureLayout, type Layout } from '@cort/client';
import { useEffect, useState } from 'react';

export { positionOf, seatOrigin, trickSlot, type Layout, type Point, type Position } from '@cort/client';

const measure = (): Layout => measureLayout(window.innerWidth, window.innerHeight);

export function useLayout(): Layout {
    const [layout, setLayout] = useState(measure);
    useEffect(() => {
        const update = () => setLayout(measure());
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);
    return layout;
}
