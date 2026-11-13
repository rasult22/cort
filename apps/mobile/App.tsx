import { LocalSession, type Session } from '@cort/client';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GameScreen } from './src/game/GameScreen';
import { Menu } from './src/Menu';
import { readLaunchOptions, type LaunchOptions } from './src/launch';
import { initSound } from './src/sound';

export default function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [name, setName] = useState('');
    const [launch, setLaunch] = useState<LaunchOptions>({});

    useEffect(() => {
        initSound();
        void readLaunchOptions().then(setLaunch);
    }, []);

    return (
        <SafeAreaProvider>
            <StatusBar style="light" />
            {session ? (
                <GameScreen
                    session={session}
                    onExit={() => {
                        session.dispose();
                        setSession(null);
                    }}
                />
            ) : (
                <Menu
                    initialName={name}
                    onPlayWithBots={(playerName) => {
                        setName(playerName);
                        setSession(
                            new LocalSession({
                                name: playerName,
                                seed: launch.seed,
                                rules: launch.hands ? { matchTarget: launch.hands } : undefined,
                            }),
                        );
                    }}
                />
            )}
        </SafeAreaProvider>
    );
}
