import { fanSlot } from '@cort/client';
import { cardId, sortHand, type Card } from '@cort/engine';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { colors } from '../theme';
import { CardFace } from './Card';
import { handCardCenter, type Geometry } from './geometry';

const SPRING = { damping: 24, stiffness: 320, mass: 0.8 };

interface HandProps {
    cards: Card[];
    handNumber: number;
    /** Ids of cards that may be played now; null when it is not our move. */
    playable: Set<string> | null;
    geometry: Geometry;
    /** `from` is where the card was, relative to the table centre, so it can fly from there. */
    onPlay: (card: Card, from: { x: number; y: number; rotate: number }) => void;
}

/** The player's own cards, fanned out along the bottom edge. */
export function Hand({ cards, handNumber, playable, geometry, onPlay }: HandProps) {
    const sorted = useMemo(() => sortHand(cards), [cards]);
    const seen = useRef(new Set<string>());
    const keys = sorted.map((card) => `${handNumber}:${cardId(card)}`);
    useEffect(() => {
        seen.current = new Set(keys);
    });

    const { layout } = geometry;
    const count = sorted.length;
    // Width of the strip of each card that is not covered by the next one: the part you can tap.
    const strip = count > 1 ? Math.abs(fanSlot(1, count, layout).x - fanSlot(0, count, layout).x) : layout.cardW;
    let fresh = 0;

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {sorted.map((card, index) => {
                const key = keys[index];
                const slot = fanSlot(index, count, layout);
                const canPlay = playable?.has(cardId(card)) ?? false;
                const delay = seen.current.has(key) ? 0 : fresh++ * 50;
                return (
                    <HandCard
                        key={key}
                        card={card}
                        x={slot.x}
                        y={slot.y - (canPlay ? layout.cardH * 0.1 : 0)}
                        rotate={slot.rotate}
                        z={index}
                        canPlay={canPlay}
                        dimmed={playable !== null && !canPlay}
                        delay={delay}
                        strip={Math.min(strip, layout.cardW)}
                        geometry={geometry}
                        onPress={() => onPlay(card, { ...handCardCenter(slot, geometry), rotate: slot.rotate })}
                    />
                );
            })}
        </View>
    );
}

interface HandCardProps {
    card: Card;
    x: number;
    y: number;
    rotate: number;
    z: number;
    canPlay: boolean;
    dimmed: boolean;
    delay: number;
    strip: number;
    geometry: Geometry;
    onPress: () => void;
}

const HandCard = memo(function HandCard({ card, x, y, rotate, z, canPlay, dimmed, delay, strip, geometry, onPress }: HandCardProps) {
    const { cardW, cardH } = geometry.layout;
    // New cards start at the middle of the table, as if dealt from the deck.
    const startY = geometry.centerY - (geometry.handBottom - cardH / 2);
    const tx = useSharedValue(0);
    const ty = useSharedValue(startY);
    const rot = useSharedValue(0);
    const scale = useSharedValue(0.6);
    const opacity = useSharedValue(0);

    useEffect(() => {
        tx.value = withDelay(delay, withSpring(x, SPRING));
        ty.value = withDelay(delay, withSpring(y, SPRING));
        rot.value = withDelay(delay, withSpring(rotate, SPRING));
        scale.value = withDelay(delay, withSpring(1, SPRING));
        opacity.value = withDelay(delay, withSpring(1, SPRING));
    }, [x, y, rotate, delay, tx, ty, rot, scale, opacity]);

    const style = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotate: `${rot.value}deg` }, { scale: scale.value }],
    }));

    return (
        <Animated.View
            style={[
                styles.card,
                { width: cardW, height: cardH, left: geometry.centerX - cardW / 2, top: geometry.handBottom - cardH, zIndex: z, elevation: z },
                style,
            ]}
        >
            <Pressable
                onPress={onPress}
                disabled={!canPlay}
                accessibilityRole="button"
                accessibilityLabel={`${card.rank} ${card.suit}`}
                style={StyleSheet.absoluteFill}
            >
                <CardFace card={card} width={cardW} />
                {canPlay && <View style={[styles.glow, { borderRadius: cardW * 0.09 }]} pointerEvents="none" />}
                {dimmed && <View style={[styles.dim, { borderRadius: cardW * 0.09 }]} pointerEvents="none" />}
                {/* The uncovered strip of the card: what UI tests tap. */}
                <View
                    testID={canPlay ? 'playable-card' : undefined}
                    style={[styles.strip, { width: Math.max(8, strip - 4) }]}
                    pointerEvents="none"
                />
            </Pressable>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    card: { position: 'absolute', transformOrigin: 'bottom' },
    glow: { ...StyleSheet.absoluteFill, borderWidth: 2, borderColor: colors.gold },
    dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5, 20, 15, 0.38)' },
    strip: { position: 'absolute', left: 0, top: 0, bottom: 0 },
});
