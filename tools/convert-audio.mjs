// Converts source sounds (.ogg) to mono 16-bit WAV, which every browser can decode —
// iPhones included, where Ogg support is unreliable. Uses the browser's own decoder,
// so no ffmpeg is needed.
// Usage: node tools/convert-audio.mjs <source-dir> <out-dir> <name> [<name> ...]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const [sourceDir, outDir, ...names] = process.argv.slice(2);
if (!sourceDir || !outDir || names.length === 0) {
    console.error('Usage: node tools/convert-audio.mjs <source-dir> <out-dir> <name> [<name> ...]');
    process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
const page = await browser.newPage();

for (const name of names) {
    const source = readFileSync(join(sourceDir, `${name}.ogg`)).toString('base64');
    const result = await page.evaluate(async (base64) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const context = new OfflineAudioContext(1, 1, 44100);
        const audio = await context.decodeAudioData(bytes.buffer);

        // Mix down to mono.
        const mono = new Float32Array(audio.length);
        for (let channel = 0; channel < audio.numberOfChannels; channel++) {
            const data = audio.getChannelData(channel);
            for (let i = 0; i < data.length; i++) mono[i] += data[i] / audio.numberOfChannels;
        }

        // Trim silence from both ends, then normalise so every sound has the same peak.
        const threshold = 0.004;
        let start = 0;
        let end = mono.length;
        while (start < end && Math.abs(mono[start]) < threshold) start++;
        while (end > start && Math.abs(mono[end - 1]) < threshold) end--;
        const trimmed = mono.subarray(start, end);
        const peak = trimmed.reduce((max, v) => Math.max(max, Math.abs(v)), 0) || 1;

        const pcm = new Int16Array(trimmed.length);
        for (let i = 0; i < trimmed.length; i++) pcm[i] = Math.round((trimmed[i] / peak) * 0.9 * 32767);
        let binary = '';
        const raw = new Uint8Array(pcm.buffer);
        for (let i = 0; i < raw.length; i += 0x8000) binary += String.fromCharCode(...raw.subarray(i, i + 0x8000));
        return { pcm: btoa(binary), sampleRate: audio.sampleRate, seconds: trimmed.length / audio.sampleRate };
    }, source);

    const pcm = Buffer.from(result.pcm, 'base64');
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(1, 22); // mono
    header.writeUInt32LE(result.sampleRate, 24);
    header.writeUInt32LE(result.sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);
    writeFileSync(join(outDir, `${name}.wav`), Buffer.concat([header, pcm]));
    console.log(`${name}: ${result.seconds.toFixed(2)}s, ${Math.round((pcm.length + 44) / 1024)} KB`);
}

await browser.close();
