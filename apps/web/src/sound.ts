/**
 * Sound design.
 *
 * Two layers:
 *  - Foley: recordings of real cards (dealing, placing, sweeping a trick).
 *  - Music: short phrases on a synthesised plucked string, in the spirit of a
 *    dutar. No audio files — the string is modelled (Karplus–Strong).
 *
 * Everything goes through one master bus with a little room reverb, so the
 * recordings and the synth sound like they are in the same place.
 */

export type Cue =
    | 'card' // a card lands on the table
    | 'trick' // a finished trick is swept away
    | 'trump'
    | 'turn'
    | 'handWin'
    | 'handLose'
    | 'matchWin'
    | 'matchLose'
    | 'tap'; // interface click

export interface CueOptions {
    /** Stereo position, -1 (left) … 1 (right). */
    pan?: number;
    /** Our own action or our team's success: a touch more present. */
    mine?: boolean;
}

const STORAGE_KEY = 'cort.muted';
const MASTER_GAIN = 0.9;

const SAMPLES = {
    place: ['card-place-1', 'card-place-2', 'card-place-3', 'card-place-4'],
    slide: ['card-slide-1', 'card-slide-2', 'card-slide-3', 'card-slide-4', 'card-slide-5', 'card-slide-6', 'card-slide-7', 'card-slide-8'],
    shove: ['card-shove-1', 'card-shove-2', 'card-shove-3', 'card-shove-4'],
    fan: ['card-fan-1'],
} as const;
type SampleGroup = keyof typeof SAMPLES;

interface Engine {
    ctx: AudioContext;
    dry: GainNode;
    reverb: GainNode;
    samples: Map<string, AudioBuffer>;
    strings: Map<number, AudioBuffer>;
    lastPick: Map<SampleGroup, number>;
}

let engine: Engine | null = null;
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

/** Browsers only allow audio after a user gesture; call this from a click or tap. */
export function unlockAudio(): void {
    try {
        engine ??= createEngine();
        if (engine.ctx.state === 'suspended') void engine.ctx.resume();
    } catch {
        engine = null; // No audio on this device: the game stays silent.
    }
}

function createEngine(): Engine {
    const ctx = new AudioContext();

    // Master: gentle compression keeps overlapping sounds from clipping.
    const master = ctx.createDynamicsCompressor();
    master.threshold.value = -14;
    master.ratio.value = 4;
    const output = ctx.createGain();
    output.gain.value = MASTER_GAIN;
    master.connect(output).connect(ctx.destination);

    const dry = ctx.createGain();
    dry.connect(master);

    const reverb = ctx.createGain();
    const room = ctx.createConvolver();
    room.buffer = roomImpulse(ctx);
    reverb.connect(room).connect(master);

    const created: Engine = { ctx, dry, reverb, samples: new Map(), strings: new Map(), lastPick: new Map() };
    void loadSamples(created);
    return created;
}

/** A small, warm room: decaying noise that gets duller as it fades. */
function roomImpulse(ctx: AudioContext): AudioBuffer {
    const seconds = 1.5;
    const length = Math.floor(ctx.sampleRate * seconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        let smoothed = 0;
        for (let i = 0; i < length; i++) {
            const t = i / length;
            // The low-pass closes over time, like air and walls absorbing the highs.
            const damping = 0.25 + 0.7 * t;
            smoothed = smoothed * damping + (Math.random() * 2 - 1) * (1 - damping);
            data[i] = smoothed * (1 - t) ** 2.4;
        }
    }
    return impulse;
}

async function loadSamples(target: Engine): Promise<void> {
    const names = Object.values(SAMPLES).flat();
    await Promise.all(
        names.map(async (name) => {
            try {
                const response = await fetch(`${import.meta.env.BASE_URL}sounds/${name}.wav`);
                target.samples.set(name, await target.ctx.decodeAudioData(await response.arrayBuffer()));
            } catch {
                // A missing sound is skipped; the rest still play.
            }
        }),
    );
}

const random = (min: number, max: number) => min + Math.random() * (max - min);

interface Voice {
    at?: number;
    gain?: number;
    rate?: number;
    pan?: number;
    /** How much of the sound goes to the room reverb, 0…1. */
    room?: number;
}

function playBuffer(e: Engine, buffer: AudioBuffer, voice: Voice): void {
    const source = e.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = voice.rate ?? 1;

    const gain = e.ctx.createGain();
    gain.gain.value = voice.gain ?? 1;
    const panner = e.ctx.createStereoPanner();
    panner.pan.value = voice.pan ?? 0;
    source.connect(gain).connect(panner);
    panner.connect(e.dry);

    if (voice.room) {
        const send = e.ctx.createGain();
        send.gain.value = voice.room;
        panner.connect(send).connect(e.reverb);
    }
    source.start(e.ctx.currentTime + (voice.at ?? 0));
}

/** Plays one recording from a group, never the same one twice in a row. */
function foley(e: Engine, group: SampleGroup, voice: Voice = {}): void {
    const names = SAMPLES[group];
    let pick = Math.floor(Math.random() * names.length);
    if (names.length > 1 && pick === e.lastPick.get(group)) pick = (pick + 1) % names.length;
    e.lastPick.set(group, pick);

    const buffer = e.samples.get(names[pick]);
    if (!buffer) return;
    // Small random changes in pitch and level keep repeats from sounding mechanical.
    playBuffer(e, buffer, {
        room: 0.07,
        ...voice,
        rate: (voice.rate ?? 1) * random(0.94, 1.07),
        gain: (voice.gain ?? 1) * random(0.85, 1),
    });
}

/**
 * A plucked string (Karplus–Strong): a burst of noise circulates in a delay
 * line one period long and is gently averaged on each pass, so the highs die
 * first — exactly what a real string does.
 */
function stringBuffer(e: Engine, frequency: number): AudioBuffer {
    const cached = e.strings.get(frequency);
    if (cached) return cached;

    const { sampleRate } = e.ctx;
    const period = Math.max(2, Math.round(sampleRate / frequency));
    const length = Math.floor(sampleRate * 2.2);
    const buffer = e.ctx.createBuffer(1, length, sampleRate);
    const out = buffer.getChannelData(0);

    // The pluck: noise, softened a little so the attack is round rather than harsh.
    const line = new Float32Array(period);
    let previous = 0;
    for (let i = 0; i < period; i++) {
        previous = previous * 0.45 + (Math.random() * 2 - 1) * 0.55;
        line[i] = previous;
    }

    const sustain = 0.9965;
    let index = 0;
    for (let i = 0; i < length; i++) {
        const next = (index + 1) % period;
        out[i] = line[index];
        line[index] = (line[index] + line[next]) * 0.5 * sustain;
        index = next;
    }
    // Fade the tail so the sound never ends with a click.
    const fade = Math.floor(sampleRate * 0.25);
    for (let i = 0; i < fade; i++) out[length - 1 - i] *= i / fade;

    e.strings.set(frequency, buffer);
    return buffer;
}

/** Note names to frequencies. The cues use D with a lowered second: D E♭ F♯ G A B♭ C. */
const NOTE = {
    D3: 146.83,
    A3: 220.0,
    D4: 293.66,
    Eb4: 311.13,
    Fs4: 369.99,
    G4: 392.0,
    A4: 440.0,
    Bb4: 466.16,
    C5: 523.25,
    D5: 587.33,
    Eb5: 622.25,
    Fs5: 739.99,
    A5: 880.0,
    D6: 1174.66,
} as const;
type NoteName = keyof typeof NOTE;

/** Each string is doubled slightly out of tune, like the paired strings of a dutar. */
function pluck(e: Engine, note: NoteName, voice: Voice = {}): void {
    const buffer = stringBuffer(e, NOTE[note]);
    const gain = voice.gain ?? 0.5;
    playBuffer(e, buffer, { room: 0.35, ...voice, gain, pan: (voice.pan ?? 0) - 0.12 });
    playBuffer(e, buffer, { room: 0.35, ...voice, gain: gain * 0.6, rate: 1.004, pan: (voice.pan ?? 0) + 0.12, at: (voice.at ?? 0) + 0.006 });
}

/** A melody: [note, seconds from start, loudness]. */
type Phrase = readonly (readonly [NoteName, number, number?])[];

function phrase(e: Engine, notes: Phrase, gain = 0.5): void {
    for (const [note, at, level = 1] of notes) pluck(e, note, { at, gain: gain * level });
}

const PHRASES = {
    trump: [
        ['D4', 0, 0.9],
        ['A4', 0.09],
        ['D5', 0.2, 0.9],
    ],
    handWin: [
        ['A4', 0],
        ['D5', 0.11],
        ['Fs5', 0.22],
        ['A5', 0.36, 1.1],
    ],
    handLose: [
        ['A4', 0],
        ['G4', 0.2, 0.9],
        ['Eb4', 0.4, 0.9],
        ['D4', 0.66, 1],
    ],
    // A rising run, an ornament around the top note, and a strummed final chord.
    matchWin: [
        ['D4', 0],
        ['A4', 0.12],
        ['D5', 0.24],
        ['Fs5', 0.36],
        ['A5', 0.48, 1.1],
        ['Fs5', 0.66, 0.8],
        ['A5', 0.78, 1],
        ['D6', 0.96, 1.2],
        ['D4', 1.38, 0.9],
        ['A4', 1.41, 0.9],
        ['D5', 1.44, 1],
        ['Fs5', 1.47, 1],
        ['A5', 1.5, 1.1],
    ],
    // A slow descent through the lowered second down to a low, final D.
    matchLose: [
        ['D5', 0],
        ['C5', 0.26, 0.9],
        ['Bb4', 0.52, 0.9],
        ['A4', 0.8],
        ['G4', 1.12, 0.9],
        ['Eb4', 1.44, 0.9],
        ['D4', 1.82, 1],
        ['D3', 2.3, 1.2],
        ['A3', 2.33, 0.7],
    ],
} satisfies Record<string, Phrase>;

export function play(cue: Cue, options: CueOptions = {}): void {
    const e = engine;
    if (muted || !e || e.ctx.state !== 'running') return;
    const pan = options.pan ?? 0;

    switch (cue) {
        case 'card':
            foley(e, 'place', { pan, gain: options.mine ? 1 : 0.8 });
            break;
        case 'trick':
            foley(e, 'shove', { pan, gain: 0.7 });
            if (options.mine) pluck(e, 'A5', { at: 0.12, gain: 0.16, pan });
            break;
        case 'trump':
            phrase(e, PHRASES.trump, 0.42);
            break;
        case 'turn':
            pluck(e, 'D5', { gain: 0.2 });
            break;
        case 'handWin':
            phrase(e, PHRASES.handWin, 0.45);
            break;
        case 'handLose':
            phrase(e, PHRASES.handLose, 0.4);
            break;
        case 'matchWin':
            phrase(e, PHRASES.matchWin, 0.5);
            break;
        case 'matchLose':
            phrase(e, PHRASES.matchLose, 0.45);
            break;
        case 'tap':
            foley(e, 'slide', { gain: 0.25, rate: 1.5 });
            break;
    }
}

/** Cards being dealt: one soft slide per card, timed to the animation. */
export function playDeal(cards: number): void {
    const e = engine;
    if (muted || !e || e.ctx.state !== 'running') return;
    if (cards >= 8) foley(e, 'fan', { gain: 0.35 });
    for (let i = 0; i < cards; i++) {
        foley(e, 'slide', { at: i * 0.055, gain: 0.5, rate: 1.15, pan: random(-0.25, 0.25) });
    }
}

/** A short tap of the phone's vibration motor, where there is one. */
export function haptic(ms = 12): void {
    if (muted) return;
    try {
        navigator.vibrate?.(ms);
    } catch {
        // Not supported: nothing to do.
    }
}
