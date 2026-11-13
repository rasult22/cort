import type { Cue, CueOptions, TableEffects } from '@cort/client';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

/**
 * Sound and vibration on the phone.
 *
 * Card sounds are the same recordings of real cards as on the web (Kenney,
 * CC0). The melodic cues of the web version are synthesised with WebAudio,
 * which React Native does not have; until they exist as recorded files,
 * those moments are marked with vibration instead.
 */

const SOURCES = {
    place: [
        require('../assets/sounds/card-place-1.wav'),
        require('../assets/sounds/card-place-2.wav'),
        require('../assets/sounds/card-place-3.wav'),
        require('../assets/sounds/card-place-4.wav'),
    ],
    shove: [
        require('../assets/sounds/card-shove-1.wav'),
        require('../assets/sounds/card-shove-2.wav'),
        require('../assets/sounds/card-shove-3.wav'),
        require('../assets/sounds/card-shove-4.wav'),
    ],
    slide: [
        require('../assets/sounds/card-slide-1.wav'),
        require('../assets/sounds/card-slide-4.wav'),
        require('../assets/sounds/card-slide-6.wav'),
        require('../assets/sounds/card-slide-8.wav'),
    ],
    fan: [require('../assets/sounds/card-fan-1.wav')],
} as const;
type Group = keyof typeof SOURCES;

let players: Record<Group, AudioPlayer[]> | null = null;
const lastPick = new Map<Group, number>();
let muted = false;

/** Loads the sounds. Safe to call more than once; failures leave the game silent. */
export function initSound(): void {
    if (players) return;
    try {
        void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
        const load = (group: Group) => SOURCES[group].map((source) => createAudioPlayer(source));
        players = { place: load('place'), shove: load('shove'), slide: load('slide'), fan: load('fan') };
    } catch {
        players = null;
    }
}

export const isMuted = (): boolean => muted;
export function setMuted(value: boolean): void {
    muted = value;
}

/** Plays one recording from a group, never the same one twice in a row. */
function foley(group: Group, volume: number, rate = 1): void {
    const list = players?.[group];
    if (muted || !list || list.length === 0) return;
    let pick = Math.floor(Math.random() * list.length);
    if (list.length > 1 && pick === lastPick.get(group)) pick = (pick + 1) % list.length;
    lastPick.set(group, pick);
    const player = list[pick];
    try {
        player.volume = volume * (0.85 + Math.random() * 0.15);
        player.setPlaybackRate(rate * (0.94 + Math.random() * 0.13));
        if (player.currentTime > 0) {
            void player.seekTo(0).then(() => player.play(), () => {});
        } else {
            player.play();
        }
    } catch {
        // A sound that fails to play is simply skipped.
    }
}

function vibrate(kind: 'light' | 'medium' | 'success' | 'warning' | 'select'): void {
    if (muted) return;
    const done = () => {};
    switch (kind) {
        case 'light':
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(done);
            break;
        case 'medium':
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(done);
            break;
        case 'success':
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(done);
            break;
        case 'warning':
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(done);
            break;
        case 'select':
            Haptics.selectionAsync().catch(done);
            break;
    }
}

export function play(cue: Cue, options: CueOptions = {}): void {
    switch (cue) {
        case 'card':
            foley('place', options.mine ? 1 : 0.8);
            break;
        case 'trick':
            foley('shove', 0.7);
            break;
        case 'trump':
            vibrate('medium');
            break;
        case 'turn':
            vibrate('select');
            break;
        case 'handWin':
        case 'matchWin':
            vibrate('success');
            break;
        case 'handLose':
        case 'matchLose':
            vibrate('warning');
            break;
        case 'tap':
            vibrate('select');
            break;
    }
}

export function playDeal(cards: number): void {
    if (cards >= 8) foley('fan', 0.35);
    for (let i = 0; i < cards; i++) setTimeout(() => foley('slide', 0.5, 1.15), i * 55);
}

export function haptic(): void {
    vibrate('light');
}

export const effects: TableEffects = { play, deal: playDeal, haptic };
