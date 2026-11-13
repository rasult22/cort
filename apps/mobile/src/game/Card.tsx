import type { Card, Suit } from '@cort/engine';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { colors, serif } from '../theme';

const SUIT_PATHS: Record<Suit, string> = {
    hearts: 'M12 21.2s-7.6-5-9.7-9.6C.8 8.3 2.5 4.3 6.3 4.3c2.2 0 4 1.3 5.7 3.5 1.7-2.2 3.5-3.5 5.7-3.5 3.8 0 5.5 4 4 7.3-2.1 4.6-9.7 9.6-9.7 9.6z',
    diamonds: 'M12 2.2 19.8 12 12 21.8 4.2 12z',
    spades: 'M12 2.2s8 5.8 9.2 10.5c.8 3.2-1.2 5.8-4.1 5.8-1.6 0-3-.7-3.9-1.9.2 2 .9 3.6 2.4 5.2H8.4c1.5-1.6 2.2-3.2 2.4-5.2-.9 1.2-2.3 1.9-3.9 1.9-2.9 0-4.9-2.6-4.1-5.8C4 8 12 2.2 12 2.2z',
    clubs: 'M12 2.4a4.5 4.5 0 0 1 3.6 7.2 4.5 4.5 0 1 1-2.5 7.5c.2 1.8.9 3.3 2.3 4.7H8.6c1.4-1.4 2.1-2.9 2.3-4.7a4.5 4.5 0 1 1-2.5-7.5A4.5 4.5 0 0 1 12 2.4z',
};

export const SUIT_NAMES: Record<Suit, string> = {
    spades: 'Пики',
    hearts: 'Червы',
    clubs: 'Трефы',
    diamonds: 'Бубны',
};

export const isRed = (suit: Suit): boolean => suit === 'hearts' || suit === 'diamonds';
export const suitColor = (suit: Suit): string => (isRed(suit) ? colors.red : colors.black);

export function SuitIcon({ suit, size, color }: { suit: Suit; size: number; color?: string }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d={SUIT_PATHS[suit]} fill={color ?? suitColor(suit)} />
        </Svg>
    );
}

const COURT = new Set(['J', 'Q', 'K']);

/** The face of a card, drawn to the given width (height is 1.4 × width). */
export const CardFace = memo(function CardFace({ card, width }: { card: Card; width: number }) {
    const color = suitColor(card.suit);
    const court = COURT.has(card.rank);
    const corner = (
        <View style={[styles.corner, { width: width * 0.26 }]}>
            <Text style={[styles.rank, { color, fontSize: width * 0.25, lineHeight: width * 0.28 }]}>{card.rank}</Text>
            <SuitIcon suit={card.suit} size={width * 0.18} />
        </View>
    );
    return (
        <View style={[styles.card, styles.face, { width, height: width * 1.4, borderRadius: width * 0.09 }]}>
            <View style={[styles.cornerTop, { left: width * 0.05, top: width * 0.05 }]}>{corner}</View>
            <View style={[styles.center]}>
                {court ? (
                    <View
                        style={[
                            styles.courtBox,
                            { borderColor: color, width: width * 0.56, height: width * 0.8, borderRadius: width * 0.05 },
                        ]}
                    >
                        <Text style={[styles.courtLetter, { color, fontSize: width * 0.4 }]}>{card.rank}</Text>
                        <SuitIcon suit={card.suit} size={width * 0.2} />
                    </View>
                ) : (
                    <SuitIcon suit={card.suit} size={width * (card.rank === 'A' ? 0.6 : 0.44)} />
                )}
            </View>
            <View style={[styles.cornerBottom, { right: width * 0.05, bottom: width * 0.05 }]}>{corner}</View>
        </View>
    );
});

/** The back of a card: crimson with a gold lattice and a medallion. */
export const CardBack = memo(function CardBack({ width }: { width: number }) {
    const height = width * 1.4;
    const inset = width * 0.07;
    const step = Math.max(4, width * 0.13);
    return (
        <View style={[styles.card, styles.back, { width, height, borderRadius: width * 0.09, padding: inset }]}>
            <Svg width={width - inset * 2} height={height - inset * 2}>
                <Defs>
                    <Pattern id="lattice" width={step} height={step} patternUnits="userSpaceOnUse">
                        <Path d={`M0 0 L${step} ${step} M${step} 0 L0 ${step}`} stroke={colors.gold} strokeOpacity={0.4} strokeWidth={1} />
                    </Pattern>
                </Defs>
                <Rect x={0} y={0} width="100%" height="100%" rx={width * 0.05} fill={colors.cardBack} />
                <Rect x={0} y={0} width="100%" height="100%" rx={width * 0.05} fill="url(#lattice)" />
                <Rect
                    x={0.5}
                    y={0.5}
                    width={width - inset * 2 - 1}
                    height={height - inset * 2 - 1}
                    rx={width * 0.05}
                    fill="none"
                    stroke={colors.gold}
                    strokeOpacity={0.7}
                />
            </Svg>
        </View>
    );
});

const styles = StyleSheet.create({
    card: {
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
    },
    face: {
        backgroundColor: colors.cardFace,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(0,0,0,0.25)',
        overflow: 'hidden',
    },
    back: {
        backgroundColor: '#f6efdc',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(0,0,0,0.3)',
    },
    corner: { alignItems: 'center' },
    cornerTop: { position: 'absolute' },
    cornerBottom: { position: 'absolute', transform: [{ rotate: '180deg' }] },
    rank: { fontFamily: serif, fontWeight: '700', letterSpacing: -1 },
    center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
    courtBox: {
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(233, 196, 106, 0.16)',
    },
    courtLetter: { fontFamily: serif, fontWeight: '700', lineHeight: undefined },
});
