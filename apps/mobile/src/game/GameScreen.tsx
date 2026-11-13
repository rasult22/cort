import { positionOf, type Session } from '@cort/client';
import { cardId, legalCards, SUITS, type Card, type Seat, type Team } from '@cort/engine';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut, useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { isMuted, play, setMuted } from '../sound';
import { colors, serif } from '../theme';
import { Button, IconButton, Panel } from '../ui';
import { SUIT_NAMES, SuitIcon, suitColor } from './Card';
import { Felt } from './Felt';
import { useGeometry } from './geometry';
import { Hand } from './Hand';
import { PlayerPlate } from './PlayerPlate';
import { TrickArea, type Origin } from './TrickArea';
import { useTable } from './useTable';

const OTHERS = [1, 2, 3] as const;
const NEXT_HAND_MS = 3600;

export function GameScreen({ session, onExit }: { session: Session; onExit: () => void }) {
    const table = useTable(session);
    const { geometry: g, onLayout } = useGeometry();
    const [myOrigin, setMyOrigin] = useState<Origin | null>(null);
    const [muted, setMutedState] = useState(isMuted);
    const { room, view, seat } = table;

    const playable = useMemo(() => {
        if (!view || view.phase !== 'playing' || view.turn !== seat) return null;
        return new Set(legalCards(view.hand, view.trick).map(cardId));
    }, [view, seat]);

    if (!room || !view) {
        return (
            <View style={styles.screen} onLayout={onLayout}>
                <Felt width={g.layout.width} height={g.layout.height} centerY={g.centerY} />
            </View>
        );
    }

    const myTeam = (seat % 2) as Team;
    const theirTeam = (1 - myTeam) as Team;
    const nameOf = (s: Seat) => room.seats[s].name;
    const myChoice = view.phase === 'choosingTrump' && view.caller === seat;
    const myTurn = view.phase === 'playing' && view.turn === seat;

    let status: string | null = null;
    if (view.phase === 'choosingTrump') status = myChoice ? 'Выберите козырь' : `${nameOf(view.caller)} выбирает козырь`;
    else if (view.phase === 'playing') status = myTurn ? 'Ваш ход' : `Ходит ${nameOf(view.turn)}`;

    const won = (view.matchWinner ?? view.handWinner) === myTeam;
    const matchOver = view.phase === 'matchOver';
    const { layout, insets } = g;
    const miniCard = Math.round(layout.cardW * 0.44);
    const handTop = g.handBottom - layout.cardH;

    const playCard = (card: Card, from: { x: number; y: number; rotate: number }) => {
        setMyOrigin({ id: cardId(card), ...from });
        session.playCard(card);
    };

    return (
        <View style={styles.screen} onLayout={onLayout}>
            <Felt width={layout.width} height={layout.height} centerY={g.centerY} />

            {/* Score */}
            <View style={[styles.score, { top: insets.top + 8, left: insets.left + 10 }]} testID="score">
                <View style={styles.scoreRow}>
                    <Text style={[styles.scoreHead, { width: 34 }]} />
                    <Text style={[styles.scoreHead, { flex: 1 }]}>ВЗЯТКИ</Text>
                    <Text style={styles.scoreHead}>СЧЁТ</Text>
                </View>
                {([myTeam, theirTeam] as const).map((team) => (
                    <View key={team} style={styles.scoreRow}>
                        <Text style={[styles.scoreTeam, team !== myTeam && styles.dimText]}>{team === myTeam ? 'Мы' : 'Они'}</Text>
                        <View style={styles.pips}>
                            {Array.from({ length: 7 }, (_, i) => (
                                <View
                                    key={i}
                                    style={[styles.pip, i < view.tricksWon[team] && (team === myTeam ? styles.pipMine : styles.pipTheirs)]}
                                />
                            ))}
                        </View>
                        <Text style={[styles.scoreMatch, team !== myTeam && styles.dimText]}>{view.matchScore[team]}</Text>
                    </View>
                ))}
            </View>

            {/* Trump, sound, exit */}
            <View style={[styles.hudRight, { top: insets.top + 8, right: insets.right + 10 }]}>
                {view.trump && (
                    <View style={styles.trumpChip} testID="trump-chip">
                        <SuitIcon suit={view.trump} size={22} />
                    </View>
                )}
                <IconButton
                    label={muted ? 'Включить звук' : 'Выключить звук'}
                    onPress={() => {
                        setMuted(!muted);
                        setMutedState(!muted);
                    }}
                >
                    <Text style={styles.iconText}>{muted ? '🔇' : '🔊'}</Text>
                </IconButton>
                <IconButton label="Выйти в меню" onPress={onExit} testID="exit">
                    <Text style={styles.iconText}>✕</Text>
                </IconButton>
            </View>

            {/* Other players */}
            {OTHERS.map((offset) => {
                const s = ((seat + offset) % 4) as Seat;
                const position = positionOf(s, seat);
                const placement =
                    position === 'top'
                        ? { top: insets.top + 72, left: 0, right: 0, alignItems: 'center' as const }
                        : position === 'left'
                          ? { top: g.centerY - 120, left: insets.left + 8 }
                          : { top: g.centerY - 120, right: insets.right + 8 };
                return (
                    <View key={s} style={[styles.plateSlot, placement]} pointerEvents="none">
                        <PlayerPlate
                            info={room.seats[s]}
                            position={position}
                            cards={view.handSizes[s]}
                            active={view.phase === 'choosingTrump' ? view.caller === s : view.phase === 'playing' && view.turn === s}
                            isCaller={view.caller === s}
                            trump={view.trump}
                            partner={offset === 2}
                            miniCard={miniCard}
                        />
                    </View>
                );
            })}

            <TrickArea plays={table.tablePlays} mySeat={seat} collectTo={table.collectTo} geometry={g} myOrigin={myOrigin} />

            {/* Status above the hand */}
            {status && (
                <View style={[styles.statusSlot, { top: handTop - 50 }]} pointerEvents="none">
                    <View style={[styles.status, (myChoice || myTurn) && styles.statusMine]} testID="status">
                        <Text style={[styles.statusText, (myChoice || myTurn) && styles.statusTextMine]}>{status}</Text>
                    </View>
                </View>
            )}

            <Hand cards={view.hand} handNumber={view.handNumber} playable={playable} geometry={g} onPlay={playCard} />

            {myChoice && (
                <Animated.View entering={ZoomIn.delay(450).springify()} exiting={ZoomOut.duration(160)} style={[styles.centerOverlay, { top: g.centerY - 95 }]}>
                    <Panel style={styles.picker}>
                        <Text style={styles.pickerTitle}>Назовите козырь</Text>
                        <View style={styles.pickerRow}>
                            {SUITS.map((suit) => (
                                <Pressable
                                    key={suit}
                                    testID={`trump-${suit}`}
                                    accessibilityRole="button"
                                    accessibilityLabel={SUIT_NAMES[suit]}
                                    onPress={() => {
                                        play('tap');
                                        session.chooseTrump(suit);
                                    }}
                                    style={({ pressed }) => [styles.suitOption, pressed && { transform: [{ scale: 0.94 }] }]}
                                >
                                    <SuitIcon suit={suit} size={32} />
                                    <Text style={styles.suitName}>{SUIT_NAMES[suit]}</Text>
                                </Pressable>
                            ))}
                        </View>
                    </Panel>
                </Animated.View>
            )}

            {table.trumpNotice && (
                <Animated.View
                    entering={ZoomIn.springify()}
                    exiting={FadeOut.duration(250)}
                    style={[styles.centerOverlay, { top: g.centerY - 90 }]}
                    pointerEvents="none"
                >
                    <View style={styles.noticeDisc}>
                        <SuitIcon suit={table.trumpNotice.suit} size={84} />
                    </View>
                    <View style={styles.noticePill}>
                        <Text style={styles.noticeText}>Козырь — {SUIT_NAMES[table.trumpNotice.suit].toLowerCase()}</Text>
                    </View>
                </Animated.View>
            )}

            {table.resultVisible && (
                <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(200)} style={styles.overlay}>
                    <Animated.View entering={ZoomIn.springify().damping(18)}>
                        <Panel style={styles.result}>
                            <Text style={[styles.resultTitle, won ? styles.resultWon : styles.resultLost]} testID="result-title">
                                {matchOver ? (won ? 'Победа!' : 'Поражение') : won ? 'Раздача ваша' : 'Раздача за соперниками'}
                            </Text>
                            <Text style={styles.resultLine}>
                                Взятки <Text style={styles.bold}>{view.tricksWon[myTeam]}</Text> : <Text style={styles.bold}>{view.tricksWon[theirTeam]}</Text>
                            </Text>
                            <View style={styles.resultScore}>
                                <Text style={styles.resultSide}>Мы</Text>
                                <Text style={styles.resultBig}>{view.matchScore[myTeam]}</Text>
                                <Text style={styles.resultColon}>:</Text>
                                <Text style={styles.resultBig}>{view.matchScore[theirTeam]}</Text>
                                <Text style={styles.resultSide}>Они</Text>
                            </View>
                            {matchOver ? (
                                <View style={styles.resultActions}>
                                    <Button label="Ещё партию" kind="primary" onPress={() => session.rematch()} style={styles.flex} testID="rematch" />
                                    <Button label="В меню" onPress={onExit} style={styles.flex} />
                                </View>
                            ) : (
                                <NextHandBar />
                            )}
                        </Panel>
                    </Animated.View>
                </Animated.View>
            )}

            {table.error && (
                <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.toast, { top: insets.top + 64 }]}>
                    <Text style={styles.toastText}>{table.error}</Text>
                </Animated.View>
            )}
        </View>
    );
}

function NextHandBar() {
    const progress = useSharedValue(1);
    useEffect(() => {
        progress.value = withTiming(0, { duration: NEXT_HAND_MS, easing: Easing.linear });
    }, [progress]);
    const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));
    return (
        <View>
            <Text style={styles.nextLabel}>СЛЕДУЮЩАЯ РАЗДАЧА</Text>
            <View style={styles.nextTrack}>
                <Animated.View style={[styles.nextBar, bar]} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.felt3, overflow: 'hidden' },
    flex: { flex: 1 },
    bold: { fontWeight: '800', color: colors.ink },
    dimText: { color: colors.inkDim },

    score: {
        position: 'absolute',
        paddingHorizontal: 11,
        paddingTop: 6,
        paddingBottom: 7,
        borderRadius: 14,
        backgroundColor: colors.panel,
        borderWidth: 1,
        borderColor: colors.panelLine,
        width: 168,
    },
    scoreRow: { flexDirection: 'row', alignItems: 'center', height: 22, gap: 6 },
    scoreHead: { fontSize: 9, letterSpacing: 1, color: colors.inkDim },
    scoreTeam: { width: 34, fontWeight: '700', color: colors.ink, fontSize: 14 },
    pips: { flex: 1, flexDirection: 'row', gap: 4 },
    pip: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.14)' },
    pipMine: { backgroundColor: colors.gold },
    pipTheirs: { backgroundColor: '#cfd6d2' },
    scoreMatch: { fontSize: 18, fontWeight: '800', color: colors.ink, minWidth: 18, textAlign: 'right' },

    hudRight: { position: 'absolute', flexDirection: 'row', gap: 8 },
    trumpChip: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: colors.cardFace,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
    },
    iconText: { fontSize: 16, color: colors.ink },

    plateSlot: { position: 'absolute' },

    statusSlot: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    status: {
        paddingHorizontal: 16,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: colors.panel,
        borderWidth: 1,
        borderColor: colors.panelLine,
    },
    statusMine: { backgroundColor: colors.goldLight, borderColor: '#fff3c4' },
    statusText: { color: colors.inkDim, fontWeight: '700', fontSize: 14 },
    statusTextMine: { color: '#2b1d00' },

    centerOverlay: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    picker: { paddingHorizontal: 14, paddingVertical: 14 },
    pickerTitle: { color: colors.gold, fontWeight: '700', fontSize: 15, textAlign: 'center', marginBottom: 12 },
    pickerRow: { flexDirection: 'row', gap: 9 },
    suitOption: {
        width: 70,
        paddingTop: 12,
        paddingBottom: 9,
        borderRadius: 14,
        backgroundColor: colors.cardFace,
        alignItems: 'center',
        gap: 6,
        elevation: 4,
    },
    suitName: { fontSize: 11, fontWeight: '700', color: '#5d574b' },

    noticeDisc: {
        width: 128,
        height: 128,
        borderRadius: 64,
        backgroundColor: colors.cardFace,
        borderWidth: 4,
        borderColor: colors.gold,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 10,
    },
    noticePill: { marginTop: 10, paddingHorizontal: 16, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.panel },
    noticeText: { color: colors.ink, fontWeight: '800' },

    overlay: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(3, 14, 11, 0.6)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    result: { width: 320, alignItems: 'stretch' },
    resultTitle: { fontFamily: serif, fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
    resultWon: { color: colors.gold },
    resultLost: { color: '#d9d4c7' },
    resultLine: { color: colors.inkDim, textAlign: 'center', fontSize: 15 },
    resultScore: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 12, marginVertical: 16 },
    resultSide: { color: colors.inkDim, fontSize: 14 },
    resultBig: { color: colors.ink, fontSize: 44, fontWeight: '800' },
    resultColon: { color: colors.inkDim, fontSize: 28 },
    resultActions: { flexDirection: 'row', gap: 10 },
    nextLabel: { color: colors.inkDim, fontSize: 11, letterSpacing: 1.2, textAlign: 'center' },
    nextTrack: { height: 3, marginTop: 8, borderRadius: 2, overflow: 'hidden' },
    nextBar: { flex: 1, backgroundColor: colors.gold, transformOrigin: 'left' },

    toast: {
        position: 'absolute',
        alignSelf: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: colors.danger,
    },
    toastText: { color: colors.ink, fontSize: 14 },
});
