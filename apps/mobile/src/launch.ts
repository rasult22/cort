import { Linking } from 'react-native';

/**
 * Options for development and UI tests, taken from the link that opened the app,
 * e.g. exp://127.0.0.1:8081/--/?hands=1&seed=7 or cort://?hands=1.
 *   hands — the match ends after this many won hands, so a test can stop at the result;
 *   seed  — the same deal every time.
 */
export interface LaunchOptions {
    hands?: number;
    seed?: number;
}

export async function readLaunchOptions(): Promise<LaunchOptions> {
    try {
        const url = await Linking.getInitialURL();
        const query = url?.split('?')[1];
        if (!query) return {};
        const params = new URLSearchParams(query);
        const number = (key: string) => {
            const value = Number(params.get(key));
            return params.has(key) && Number.isInteger(value) && value > 0 ? value : undefined;
        };
        return { hands: number('hands'), seed: number('seed') };
    } catch {
        return {};
    }
}
