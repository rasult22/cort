import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../theme';

const turn = (count: number, offset = 0) => Array.from({ length: count }, (_, i) => offset + (i * 360) / count);
const GOLD = colors.gold;

/**
 * The felt and its central medallion, drawn after motifs of Uyghur ornament:
 * the badam (almond), the pomegranate flower, the tulip bud and the
 * eight-pointed star. Same drawing as the web table. Purely decorative.
 */
export const Felt = memo(function Felt({ width, height, centerY }: { width: number; height: number; centerY: number }) {
    const size = Math.min(width, height) * 0.86;
    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width={width} height={height}>
                <Defs>
                    <RadialGradient id="felt" cx="50%" cy={`${(centerY / height) * 100}%`} rx="85%" ry="62%">
                        <Stop offset="0" stopColor={colors.felt1} />
                        <Stop offset="0.58" stopColor={colors.felt2} />
                        <Stop offset="1" stopColor={colors.felt3} />
                    </RadialGradient>
                </Defs>
                <Rect x={0} y={0} width={width} height={height} fill="url(#felt)" />
            </Svg>
            <View style={[styles.medallion, { width: size, height: size, left: (width - size) / 2, top: centerY - size / 2 }]}>
                <Medallion size={size} />
            </View>
        </View>
    );
});

function Medallion({ size }: { size: number }) {
    return (
        <Svg width={size} height={size} viewBox="-100 -100 200 200" opacity={0.17}>
            <G fill="none" stroke={GOLD} strokeWidth={0.7} strokeLinecap="round" strokeLinejoin="round">
                <Circle r={98} />
                <Circle r={88.5} />
                {turn(32).map((angle) => (
                    <Path key={`l${angle}`} d="M0 -96 C 2.6 -94.5, 2.6 -91.5, 0 -90.5 C -2.6 -91.5, -2.6 -94.5, 0 -96 Z" rotation={angle} />
                ))}
                {turn(32, 5.625).map((angle) => (
                    <Circle key={`b${angle}`} cx={0} cy={-93.2} r={0.9} fill={GOLD} stroke="none" rotation={angle} />
                ))}

                {turn(8).map((angle) => (
                    <G key={`a${angle}`} rotation={angle}>
                        <Path
                            d="M-7 -56 C -16 -63, -13 -78, 1 -82 C 8 -84, 13.5 -80.5, 12.5 -76.5 C 6.5 -78.5, 1.5 -74, 1.5 -68 C 1.5 -62.5, -2 -57.5, -7 -56 Z"
                            fill={GOLD}
                            fillOpacity={0.14}
                        />
                        <Path d="M-6.5 -61 C -10.5 -66, -8.5 -74.5, -1 -77.5" opacity={0.85} />
                        <Circle cx={-3.5} cy={-68} r={1.5} fill={GOLD} stroke="none" />
                    </G>
                ))}

                {turn(8, 22.5).map((angle) => (
                    <G key={`t${angle}`} rotation={angle}>
                        <Path d="M0 -52 C -3 -58, 3 -62, 0 -67" />
                        <Path
                            d="M0 -67 C -5 -69, -5.5 -76, -3.5 -79.5 C -2 -76, -1 -74, 0 -73 C 1 -74, 2 -76, 3.5 -79.5 C 5.5 -76, 5 -69, 0 -67 Z"
                            fill={GOLD}
                            fillOpacity={0.25}
                        />
                        <Path d="M0 -73 L 0 -81.5" />
                        <Path d="M0 -57 C -5 -57, -7.5 -60, -8 -63.5 M0 -57 C 5 -57, 7.5 -60, 8 -63.5" />
                    </G>
                ))}

                <Circle r={50} />
                <Circle r={47} strokeDasharray="0.2 2.6" strokeWidth={1.2} />

                <Rect x={-31} y={-31} width={62} height={62} />
                <Rect x={-31} y={-31} width={62} height={62} rotation={45} />
                <Path
                    d="M0 -43.8 L 12.8 -31 L 31 -31 L 31 -12.8 L 43.8 0 L 31 12.8 L 31 31 L 12.8 31 L 0 43.8 L -12.8 31 L -31 31 L -31 12.8 L -43.8 0 L -31 -12.8 L -31 -31 L -12.8 -31 Z"
                    strokeWidth={1}
                />
                {turn(8, 22.5).map((angle) => (
                    <Circle key={`s${angle}`} cx={0} cy={-36} r={1.2} fill={GOLD} stroke="none" rotation={angle} />
                ))}

                {turn(8).map((angle) => (
                    <Path key={`p${angle}`} d="M0 -9 C 6.5 -13, 7 -21, 0 -27.5 C -7 -21, -6.5 -13, 0 -9 Z" fill={GOLD} fillOpacity={0.18} rotation={angle} />
                ))}
                {turn(8, 22.5).map((angle) => (
                    <Path key={`q${angle}`} d="M0 -10 C 3.5 -13, 4 -17, 0 -21 C -4 -17, -3.5 -13, 0 -10 Z" rotation={angle} />
                ))}
                <Circle r={8.5} fill={GOLD} fillOpacity={0.22} />
                {turn(6).map((angle) => (
                    <Circle key={`c${angle}`} cx={0} cy={-4.2} r={1.1} fill={GOLD} stroke="none" rotation={angle} />
                ))}
                <Circle r={1.3} fill={GOLD} stroke="none" />
            </G>
        </Svg>
    );
}

const styles = StyleSheet.create({
    medallion: { position: 'absolute' },
});
