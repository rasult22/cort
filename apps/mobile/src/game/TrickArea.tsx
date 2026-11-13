import { positionOf, seatOrigin, trickSlot } from '@cort/client';
import { cardId, type Play, type Seat } from '@cort/engine';
import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { CardFace } from './Card';
import type { Geometry } from './geometry';

export interface Origin {
    id: string;
    x: number;
    y: number;
    rotate: number;
}

interface TrickAreaProps {
    plays: Play[];
    mySeat: Seat;
    collectTo: Seat | null;
    geometry: Geometry;
    /** Where our own card was in the hand when we played it. */
    myOrigin: Origin | null;
}

const SWEEP_MS = 420;

/** Cards in the middle of the table, and the sweep of a won trick towards its winner. */
export function TrickArea({ plays, mySeat, collectTo, geometry, myOrigin }: TrickAreaProps) {
    const previous = useRef<Play[]>([]);
    const [leaving, setLeaving] = useState<{ plays: Play[]; to: Seat; batch: number } | null>(null);
    const batch = useRef(0);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

    // Cards that were on the table and no longer are: the trick was taken, sweep them away.
    useEffect(() => {
        const now = new Set(plays.map((p) => cardId(p.card)));
        const gone = previous.current.filter((p) => !now.has(cardId(p.card)));
        previous.current = plays;
        if (gone.length === 0 || collectTo === null) return;
        const id = ++batch.current;
        setLeaving({ plays: gone, to: collectTo, batch: id });
        clearTimeout(timer.current ?? undefined);
        timer.current = setTimeout(() => setLeaving((current) => (current?.batch === id ? null : current)), SWEEP_MS + 80);
    }, [plays, collectTo]);

    return (
        <View style={[styles.anchor, { left: geometry.centerX, top: geometry.centerY }]} pointerEvents="none">
            {leaving?.plays.map((play, index) => (
                <LeavingCard key={`out-${leaving.batch}-${cardId(play.card)}`} play={play} to={leaving.to} mySeat={mySeat} geometry={geometry} z={index} />
            ))}
            {plays.map((play, index) => (
                <TrickCard key={cardId(play.card)} play={play} mySeat={mySeat} geometry={geometry} origin={myOrigin} z={10 + index} />
            ))}
        </View>
    );
}

const TrickCard = memo(function TrickCard({
    play,
    mySeat,
    geometry,
    origin,
    z,
}: {
    play: Play;
    mySeat: Seat;
    geometry: Geometry;
    origin: Origin | null;
    z: number;
}) {
    const { layout } = geometry;
    const position = positionOf(play.seat, mySeat);
    const slot = trickSlot(position, layout);
    const mine = origin?.id === cardId(play.card);
    const from = mine ? origin : { ...seatOrigin(position, layout), rotate: slot.rotate * 4 };

    const x = useSharedValue(from.x);
    const y = useSharedValue(from.y);
    const rot = useSharedValue(from.rotate);
    const scale = useSharedValue(mine ? 1 : 0.7);
    const opacity = useSharedValue(mine ? 1 : 0);

    useEffect(() => {
        const spring = { damping: 26, stiffness: 260 };
        x.value = withSpring(slot.x, spring);
        y.value = withSpring(slot.y, spring);
        rot.value = withSpring(slot.rotate, spring);
        scale.value = withSpring(1, spring);
        opacity.value = withTiming(1, { duration: 160 });
    }, [slot.x, slot.y, slot.rotate, x, y, rot, scale, opacity]);

    const style = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${rot.value}deg` }, { scale: scale.value }],
    }));

    return (
        <Animated.View
            style={[styles.card, { width: layout.cardW, height: layout.cardH, left: -layout.cardW / 2, top: -layout.cardH / 2, zIndex: z, elevation: z }, style]}
        >
            <CardFace card={play.card} width={layout.cardW} />
        </Animated.View>
    );
});

const LeavingCard = memo(function LeavingCard({ play, to, mySeat, geometry, z }: { play: Play; to: Seat; mySeat: Seat; geometry: Geometry; z: number }) {
    const { layout } = geometry;
    const slot = trickSlot(positionOf(play.seat, mySeat), layout);
    const target = seatOrigin(positionOf(to, mySeat), layout);
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.value = withTiming(1, { duration: SWEEP_MS, easing: Easing.in(Easing.quad) });
    }, [progress]);

    const style = useAnimatedStyle(() => {
        const t = progress.value;
        return {
            opacity: 1 - t,
            transform: [
                { translateX: slot.x + (target.x * 0.8 - slot.x) * t },
                { translateY: slot.y + (target.y * 0.8 - slot.y) * t },
                { rotate: `${slot.rotate}deg` },
                { scale: 1 - 0.55 * t },
            ],
        };
    });

    return (
        <Animated.View
            style={[styles.card, { width: layout.cardW, height: layout.cardH, left: -layout.cardW / 2, top: -layout.cardH / 2, zIndex: z, elevation: z }, style]}
        >
            <CardFace card={play.card} width={layout.cardW} />
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    anchor: { position: 'absolute', width: 0, height: 0 },
    card: { position: 'absolute' },
});
