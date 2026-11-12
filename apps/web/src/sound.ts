/** All sounds are synthesised with WebAudio, so the game ships no audio files. */

export type SoundName = 'deal' | 'card' | 'trick' | 'trump' | 'turn' | 'win' | 'lose';

const STORAGE_KEY = 'cort.muted';
let context: AudioContext | null = null;
let muted = readMuted();

function readMuted(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

export function isMuted(): boolean {
    return muted;
}

export function setMuted(value: boolean): void {
    muted = value;
    try {
        localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
        // Private mode: the setting just does not persist.
    }
}

/** Browsers only allow audio after a user gesture; call this from a click. */
export function unlockAudio(): void {
    try {
        context ??= new AudioContext();
        if (context.state === 'suspended') void context.resume();
    } catch {
        context = null;
    }
}

function tone(ctx: AudioContext, freq: number, at: number, duration: number, gain: number, type: OscillatorType = 'sine') {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(gain, at + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + duration + 0.02);
}

/** A short burst of filtered noise: the "flick" of a card. */
function flick(ctx: AudioContext, at: number, duration: number, freq: number, gain: number) {
    const length = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 0.8;
    amp.gain.value = gain;
    source.connect(filter).connect(amp).connect(ctx.destination);
    source.start(at);
}

export function play(name: SoundName): void {
    if (muted || !context || context.state !== 'running') return;
    const ctx = context;
    const t = ctx.currentTime;
    switch (name) {
        case 'deal':
            for (let i = 0; i < 5; i++) flick(ctx, t + i * 0.07, 0.05, 3200, 0.16);
            break;
        case 'card':
            flick(ctx, t, 0.07, 2400, 0.4);
            tone(ctx, 140, t, 0.08, 0.12);
            break;
        case 'trick':
            flick(ctx, t, 0.16, 1500, 0.22);
            tone(ctx, 523, t + 0.05, 0.22, 0.07, 'triangle');
            break;
        case 'trump':
            tone(ctx, 659, t, 0.5, 0.1, 'triangle');
            tone(ctx, 988, t + 0.09, 0.6, 0.08, 'triangle');
            break;
        case 'turn':
            tone(ctx, 880, t, 0.12, 0.05);
            break;
        case 'win':
            [523, 659, 784, 1047].forEach((f, i) => tone(ctx, f, t + i * 0.11, 0.5, 0.1, 'triangle'));
            break;
        case 'lose':
            [440, 370, 311].forEach((f, i) => tone(ctx, f, t + i * 0.16, 0.5, 0.08, 'triangle'));
            break;
    }
}
