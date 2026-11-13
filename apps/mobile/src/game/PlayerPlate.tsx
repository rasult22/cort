import type { Position } from '@cort/client';
import type { Suit } from '@cort/engine';
import type { SeatInfo } from '@cort/protocol';
import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { colors } from '../theme';
import { CardBack, SuitIcon, suitColor } from './Card';

interface PlayerPlateProps {
    info: SeatInfo;
    position: Position;
    cards: number;
    active: boolean;
    isCaller: boolean;
    trump: Suit | null;
    partner: boolean;
    miniCard: number;
}

const AVATAR = 46;

/** An opponent or partner: avatar, name, and their face-down cards. */
export const PlayerPlate = memo(function PlayerPlate({ info, position, cards, active, isCaller, trump, partner, miniCard }: PlayerPlateProps) {
    const pulse = useSharedValue(0);
    useEffect(() => {
        if (active) {
            pulse.value = withRepeat(withTiming(1, { duration: 650 }), -1, true);
        } else {
            cancelAnimation(pulse);
            pulse.value = withTiming(0, { duration: 200 });
        }
    }, [active, pulse]);

    const ring = useAnimatedStyle(() => ({
        opacity: pulse.value * 0.9,
        transform: [{ scale: 1 + pulse.value * 0.12 }],
    }));

    const tag = partner ? 'напарник' : info.kind === 'bot' ? 'бот' : null;
    const vertical = position !== 'top';
    const shown = Math.min(cards, 13);
    const step = vertical ? miniCard * 0.2 : miniCard * 0.3;

    return (
        <View style={styles.plate} testID={`plate-${position}`}>
            <View style={styles.avatarWrap}>
                <Animated.View style={[styles.ring, ring]} />
                <View style={[styles.avatar, active && styles.avatarActive]}>
                    <Text style={styles.initial}>{info.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                {isCaller && (
                    <View style={styles.caller}>
                        {trump ? <SuitIcon suit={trump} size={14} color={suitColor(trump)} /> : <Text style={styles.crown}>♛</Text>}
                    </View>
                )}
            </View>
            <View style={styles.namePill}>
                <Text style={styles.name} numberOfLines={1}>
                    {info.name}
                </Text>
                {tag && <Text style={styles.tag}>{tag}</Text>}
            </View>
            {shown > 0 && (
                <View
                    style={{
                        width: vertical ? miniCard : miniCard + (shown - 1) * step,
                        height: vertical ? miniCard * 1.4 + (shown - 1) * step : miniCard * 1.4,
                        marginTop: 4,
                    }}
                >
                    {Array.from({ length: shown }, (_, i) => (
                        <View key={i} style={{ position: 'absolute', left: vertical ? 0 : i * step, top: vertical ? i * step : 0 }}>
                            <CardBack width={miniCard} />
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
});

const styles = StyleSheet.create({
    plate: { alignItems: 'center' },
    avatarWrap: { width: AVATAR, height: AVATAR, alignItems: 'center', justifyContent: 'center' },
    ring: {
        position: 'absolute',
        width: AVATAR + 14,
        height: AVATAR + 14,
        borderRadius: (AVATAR + 14) / 2,
        backgroundColor: 'rgba(233, 196, 106, 0.35)',
    },
    avatar: {
        width: AVATAR,
        height: AVATAR,
        borderRadius: AVATAR / 2,
        backgroundColor: colors.gold,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: 'rgba(0,0,0,0.28)',
    },
    avatarActive: { borderColor: '#fff3c4' },
    initial: { fontSize: 20, fontWeight: '800', color: colors.felt3 },
    caller: {
        position: 'absolute',
        right: -6,
        bottom: -4,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: colors.cardFace,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 3,
    },
    crown: { fontSize: 12, color: colors.black },
    namePill: {
        marginTop: 4,
        paddingHorizontal: 9,
        paddingVertical: 2,
        borderRadius: 10,
        backgroundColor: colors.panel,
        alignItems: 'center',
        maxWidth: 120,
    },
    name: { color: colors.ink, fontSize: 12, fontWeight: '700' },
    tag: { color: colors.inkDim, fontSize: 10 },
});
