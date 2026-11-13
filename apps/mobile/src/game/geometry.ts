import { measureLayout, type Layout } from '@cort/client';
import { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

/** Where things are on this screen, in points from the top-left corner. */
export interface Geometry {
    layout: Layout;
    insets: EdgeInsets;
    /** The middle of the table: tricks land here. */
    centerX: number;
    centerY: number;
    /** The bottom edge the hand rests on. */
    handBottom: number;
}

/** Geometry of the view that receives `onLayout`; until it is measured, the window size stands in. */
export function useGeometry(): { geometry: Geometry; onLayout: (event: LayoutChangeEvent) => void } {
    const window = useWindowDimensions();
    const [size, setSize] = useState<{ width: number; height: number } | null>(null);
    const onLayout = useCallback((event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        setSize((current) => (current && current.width === width && current.height === height ? current : { width, height }));
    }, []);
    const { width, height } = size ?? window;
    const insets = useSafeAreaInsets();
    const geometry = useMemo(() => {
        const layout = measureLayout(width, height);
        return {
            layout,
            insets,
            centerX: width / 2,
            centerY: height * 0.46,
            handBottom: height - insets.bottom - layout.cardW * 0.3,
        };
    }, [width, height, insets]);
    return { geometry, onLayout };
}

/** A hand card's resting centre, relative to the table centre. */
export function handCardCenter(slot: { x: number; y: number }, g: Geometry): { x: number; y: number } {
    return { x: slot.x, y: g.handBottom - g.layout.cardH / 2 + slot.y - g.centerY };
}
