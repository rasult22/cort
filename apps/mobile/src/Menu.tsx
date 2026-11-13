import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SuitIcon } from './game/Card';
import { Felt } from './game/Felt';
import { useGeometry } from './game/geometry';
import { colors, serif } from './theme';
import { Button, Panel } from './ui';

const AUTHOR_TELEGRAM = 'https://t.me/rasult22js';

export function Menu({ initialName, onPlayWithBots }: { initialName: string; onPlayWithBots: (name: string) => void }) {
    const { geometry, onLayout } = useGeometry();
    const { width, height } = geometry.layout;
    const insets = useSafeAreaInsets();
    const [name, setName] = useState(initialName);
    const [nameMissing, setNameMissing] = useState(false);

    const start = () => {
        const trimmed = name.trim();
        if (!trimmed) {
            setNameMissing(true);
            return;
        }
        onPlayWithBots(trimmed);
    };

    return (
        <View style={styles.screen} onLayout={onLayout}>
            <Felt width={width} height={height} centerY={geometry.centerY} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
                <ScrollView
                    contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
                    keyboardShouldPersistTaps="handled"
                >
                    <Panel style={styles.panel}>
                        <View style={styles.suits}>
                            <SuitIcon suit="spades" size={20} color={colors.ink} />
                            <SuitIcon suit="hearts" size={20} color="#e5475e" />
                            <SuitIcon suit="clubs" size={20} color={colors.ink} />
                            <SuitIcon suit="diamonds" size={20} color="#e5475e" />
                        </View>
                        <Text style={styles.title} testID="menu-title">
                            Корт
                        </Text>
                        <Text style={styles.subtitle}>УЙГУРСКАЯ КАРТОЧНАЯ ИГРА</Text>

                        <Text style={styles.label}>Ваше имя</Text>
                        <TextInput
                            testID="name-input"
                            value={name}
                            onChangeText={(text) => {
                                setName(text);
                                if (text.trim()) setNameMissing(false);
                            }}
                            maxLength={16}
                            placeholder="Как вас зовут?"
                            placeholderTextColor="rgba(244, 239, 225, 0.35)"
                            autoCapitalize="words"
                            autoCorrect={false}
                            returnKeyType="go"
                            onSubmitEditing={start}
                            style={[styles.input, nameMissing && styles.inputInvalid]}
                        />
                        {nameMissing && <Text style={styles.error} testID="name-error">Введите имя, чтобы начать игру</Text>}

                        <Button label="Играть с ботами" kind="primary" onPress={start} testID="play-bots" style={styles.gap} />

                        <Text style={styles.note}>Двое на двое · 13 карт · первая команда с 7 взятками берёт раздачу</Text>
                        <View style={styles.divider} />
                        <Text style={styles.contact}>
                            Идеи и предложения — автору в Telegram:{' '}
                            <Text style={styles.link} onPress={() => void Linking.openURL(AUTHOR_TELEGRAM)}>
                                @rasult22js
                            </Text>
                        </Text>
                    </Panel>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.felt3 },
    flex: { flex: 1 },
    scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16 },
    panel: { alignSelf: 'center', width: '100%', maxWidth: 380 },
    suits: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
    title: {
        fontFamily: serif,
        fontSize: 62,
        fontWeight: '700',
        color: colors.gold,
        textAlign: 'center',
        marginTop: 4,
        textShadowColor: 'rgba(0,0,0,0.45)',
        textShadowRadius: 12,
        textShadowOffset: { width: 0, height: 4 },
    },
    subtitle: { textAlign: 'center', color: colors.inkDim, letterSpacing: 2.6, fontSize: 12, marginBottom: 22 },
    label: { color: colors.inkDim, fontSize: 12, marginLeft: 4, marginBottom: 5 },
    input: {
        height: 50,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: colors.panelLine,
        backgroundColor: 'rgba(0,0,0,0.28)',
        paddingHorizontal: 14,
        color: colors.ink,
        fontSize: 16,
    },
    inputInvalid: { borderColor: '#ff7088' },
    error: { color: '#ff9aa9', fontSize: 12, marginTop: 6, marginLeft: 4 },
    gap: { marginTop: 12 },
    note: { color: colors.inkDim, fontSize: 12, textAlign: 'center', marginTop: 18, lineHeight: 18 },
    divider: { height: 1, backgroundColor: colors.panelLine, marginVertical: 14 },
    contact: { color: colors.inkDim, fontSize: 13, textAlign: 'center', lineHeight: 20 },
    link: { color: colors.gold, fontWeight: '700' },
});
