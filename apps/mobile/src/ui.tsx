import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, serif } from './theme';

interface ButtonProps {
    label: string;
    onPress: () => void;
    kind?: 'primary' | 'plain' | 'ghost';
    testID?: string;
    style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, kind = 'plain', testID, style }: ButtonProps) {
    return (
        <Pressable
            testID={testID}
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [styles.button, styles[kind], pressed && styles.pressed, style]}
        >
            <Text style={[styles.label, kind === 'primary' && styles.labelPrimary, kind === 'ghost' && styles.labelGhost]}>{label}</Text>
        </Pressable>
    );
}

export function IconButton({ children, onPress, label, testID }: { children: ReactNode; onPress: () => void; label: string; testID?: string }) {
    return (
        <Pressable
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
            hitSlop={6}
            style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
        >
            {children}
        </Pressable>
    );
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
    return <View style={[styles.panel, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
    return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
    button: {
        height: 50,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 18,
        borderWidth: 1,
    },
    primary: { backgroundColor: colors.goldDeep, borderColor: '#fff3c4' },
    plain: { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: colors.panelLine },
    ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
    pressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
    label: { color: colors.ink, fontSize: 16, fontWeight: '700' },
    labelPrimary: { color: '#2b1d00' },
    labelGhost: { color: colors.inkDim },
    icon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.panel,
        borderWidth: 1,
        borderColor: colors.panelLine,
    },
    panel: {
        borderRadius: 24,
        padding: 22,
        backgroundColor: colors.panelSolid,
        borderWidth: 1,
        borderColor: colors.panelLine,
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
    },
    title: { fontFamily: serif, fontSize: 28, fontWeight: '700', color: colors.ink, textAlign: 'center' },
});
