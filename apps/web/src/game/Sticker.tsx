import { STICKERS, type StickerId } from '@cort/protocol';
import type { ReactNode } from 'react';

/**
 * The game's own sticker pack: one character in a doppa, nine reactions.
 * Drawn in code, so the pack ships no image files and belongs to the game.
 */

const SKIN = '#f3c9a0';
const SKIN_SHADE = '#dba878';
const INK = '#2a1a12';
const CAP = '#1e5a45';
const GOLD = '#e9c46a';

type Eyes = 'open' | 'happy' | 'wide' | 'side' | 'shut' | 'half' | 'shades';
type Brows = 'none' | 'raised' | 'sad' | 'angry';
type Mouth = 'smile' | 'grin' | 'o' | 'flat' | 'sad' | 'gritted' | 'smirk';
type Extra = 'thumb' | 'hands' | 'tears' | 'chin' | 'tear' | 'steam' | 'zzz' | 'card' | 'heart';

interface Spec {
    caption: string;
    eyes: Eyes;
    brows?: Brows;
    mouth: Mouth;
    extra: Extra;
    face?: string;
    tilt?: number;
}

const SPECS: Record<StickerId, Spec> = {
    nice: { caption: 'Красавчик!', eyes: 'happy', mouth: 'grin', extra: 'thumb' },
    wow: { caption: 'Ой-бой!', eyes: 'wide', brows: 'raised', mouth: 'o', extra: 'hands' },
    lol: { caption: 'Ха-ха-ха', eyes: 'happy', mouth: 'grin', extra: 'tears', tilt: -9 },
    hmm: { caption: 'Хм…', eyes: 'side', brows: 'raised', mouth: 'flat', extra: 'chin' },
    sad: { caption: 'Эх…', eyes: 'shut', brows: 'sad', mouth: 'sad', extra: 'tear' },
    angry: { caption: 'Ну всё!', eyes: 'open', brows: 'angry', mouth: 'gritted', extra: 'steam', face: '#f0a088' },
    hurry: { caption: 'Ходи уже!', eyes: 'half', mouth: 'flat', extra: 'zzz' },
    trump: { caption: 'Козырь!', eyes: 'shades', mouth: 'smirk', extra: 'card' },
    thanks: { caption: 'Рахмет!', eyes: 'happy', mouth: 'smile', extra: 'heart' },
};

export const isSticker = (value: string): value is StickerId => (STICKERS as readonly string[]).includes(value);

export const stickerCaption = (id: StickerId): string => SPECS[id].caption;

const stroke = { stroke: INK, strokeWidth: 2.600, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;

const EYES: Record<Eyes, ReactNode> = {
    open: (
        <>
            <circle cx="48" cy="60" r="3.800" fill={INK} />
            <circle cx="72" cy="60" r="3.800" fill={INK} />
        </>
    ),
    happy: <path d="M42 62 Q48 54 54 62 M66 62 Q72 54 78 62" {...stroke} />,
    wide: (
        <>
            <circle cx="47" cy="59" r="8" fill="#fff" stroke={INK} strokeWidth="2" />
            <circle cx="73" cy="59" r="8" fill="#fff" stroke={INK} strokeWidth="2" />
            <circle cx="47" cy="60" r="3.200" fill={INK} />
            <circle cx="73" cy="60" r="3.200" fill={INK} />
        </>
    ),
    side: (
        <>
            <circle cx="47" cy="60" r="6.500" fill="#fff" stroke={INK} strokeWidth="2" />
            <circle cx="73" cy="60" r="6.500" fill="#fff" stroke={INK} strokeWidth="2" />
            <circle cx="50" cy="58" r="3" fill={INK} />
            <circle cx="76" cy="58" r="3" fill={INK} />
        </>
    ),
    shut: <path d="M42 59 Q48 65 54 59 M66 59 Q72 65 78 59" {...stroke} />,
    half: (
        <>
            <path d="M41 58 H55 M65 58 H79" {...stroke} />
            <path d="M43.500 59 A4.500 4.500 0 0 0 52.500 59 Z M67.500 59 A4.500 4.500 0 0 0 76.500 59 Z" fill={INK} />
        </>
    ),
    shades: (
        <>
            <path d="M36 54 H84" stroke={INK} strokeWidth="3" />
            <path d="M38 54 H57 V60 Q57 68 47.500 68 Q38 68 38 60 Z M63 54 H82 V60 Q82 68 72.500 68 Q63 68 63 60 Z" fill={INK} />
            <path d="M42 57 L47 57 M67 57 L72 57" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.700" />
        </>
    ),
};

const BROWS: Record<Brows, ReactNode> = {
    none: null,
    raised: <path d="M41 49 Q47 44 54 48 M66 46 Q73 41 80 46" {...stroke} />,
    sad: <path d="M41 53 L54 49 M66 49 L79 53" {...stroke} />,
    angry: <path d="M40 48 L55 54 M65 54 L80 48" {...stroke} strokeWidth="3.400" />,
};

const MOUTH: Record<Mouth, ReactNode> = {
    smile: <path d="M49 82 Q60 91 71 82" {...stroke} />,
    grin: (
        <>
            <path d="M46 80 Q60 99 74 80 Z" fill="#7a1f2b" stroke={INK} strokeWidth="2.200" strokeLinejoin="round" />
            <path d="M49 81.500 Q60 86 71 81.500 L72 80.500 H48 Z" fill="#fff" />
        </>
    ),
    o: <ellipse cx="60" cy="86" rx="5.500" ry="7.500" fill="#7a1f2b" stroke={INK} strokeWidth="2.200" />,
    flat: <path d="M51 85 H69" {...stroke} />,
    sad: <path d="M50 89 Q60 80 70 89" {...stroke} />,
    gritted: (
        <>
            <rect x="48" y="81" width="24" height="10" rx="3" fill="#fff" stroke={INK} strokeWidth="2.200" />
            <path d="M54 81 V91 M60 81 V91 M66 81 V91 M48 86 H72" stroke={INK} strokeWidth="1.400" />
        </>
    ),
    smirk: <path d="M50 84 Q62 90 73 79" {...stroke} />,
};

const hand = (cx: number, cy: number, r = 9) => <circle cx={cx} cy={cy} r={r} fill={SKIN} stroke={INK} strokeWidth="2.200" />;

const EXTRAS: Record<Extra, ReactNode> = {
    thumb: (
        <g>
            <path d="M92 72 Q90 62 96 58 Q101 58 100 66 L100 72 Z" fill={SKIN} stroke={INK} strokeWidth="2.200" strokeLinejoin="round" />
            <rect x="87" y="70" width="20" height="18" rx="6" fill={SKIN} stroke={INK} strokeWidth="2.200" />
            <path d="M107 30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z M16 40 l1.500 4 4 1.500 -4 1.500 -1.500 4 -1.500 -4 -4 -1.500 4 -1.500 Z" fill={GOLD} />
        </g>
    ),
    hands: (
        <g>
            {hand(27, 80)}
            {hand(93, 80)}
            <path d="M12 34 L20 40 M108 34 L100 40 M60 4 V11" stroke={GOLD} strokeWidth="3" strokeLinecap="round" />
        </g>
    ),
    tears: (
        <g fill="#6cc4f5" stroke="#2b7fb8" strokeWidth="1.400">
            <path d="M36 62 Q28 70 32 76 Q38 78 39 70 Z" />
            <path d="M84 62 Q92 70 88 76 Q82 78 81 70 Z" />
        </g>
    ),
    chin: (
        <g>
            {hand(72, 97, 8.500)}
            <path d="M96 22 q6 -8 -1 -12 q-9 0 -7 8 M93 30 v0.100" stroke={GOLD} strokeWidth="3.200" strokeLinecap="round" fill="none" />
        </g>
    ),
    tear: <path d="M76 66 Q71 75 76 79 Q81 75 76 66 Z" fill="#6cc4f5" stroke="#2b7fb8" strokeWidth="1.400" />,
    steam: (
        <g fill="#fff" stroke={INK} strokeWidth="1.800">
            <path d="M14 46 q-6 -3 -3 -9 q5 -4 9 1 q5 -2 6 4 q-1 6 -12 4 Z" />
            <path d="M106 46 q6 -3 3 -9 q-5 -4 -9 1 q-5 -2 -6 4 q1 6 12 4 Z" />
        </g>
    ),
    zzz: (
        <text x="92" y="30" fontSize="20" fontWeight="800" fill="#fff" stroke={INK} strokeWidth="3.500" paintOrder="stroke" fontFamily="system-ui, sans-serif">
            z
            <tspan dx="-2" dy="-9" fontSize="14">
                z
            </tspan>
        </text>
    ),
    card: (
        <g transform="rotate(14 96 78)">
            <rect x="85" y="60" width="24" height="33" rx="3.500" fill="#fffdf5" stroke={INK} strokeWidth="2" />
            <path
                d="M97 67 q8 6 9 10.500 q0.500 5 -4 5 q-2 0 -3.500 -1.500 q0.300 2.500 2 4.500 h-7 q1.700 -2 2 -4.500 q-1.500 1.500 -3.500 1.500 q-4.500 0 -4 -5 q1 -4.500 9 -10.500 Z"
                fill={INK}
                transform="translate(97 76) scale(0.800) translate(-97 -76)"
            />
        </g>
    ),
    heart: (
        <g>
            {hand(60, 99, 8.500)}
            <path d="M96 24 q-7 -8 -13 -2 q-5 7 13 18 q18 -11 13 -18 q-6 -6 -13 2 Z" fill="#e5475e" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        </g>
    ),
};

/** A sticker. Its size is set by the CSS of whatever contains it. */
export function Sticker({ id }: { id: StickerId }) {
    const spec = SPECS[id];
    return (
        <svg viewBox="0 0 120 122" className="sticker" role="img" aria-label={spec.caption}>
            <g transform={spec.tilt ? `rotate(${spec.tilt} 60 62)` : undefined}>
                {/* Ears, face */}
                <circle cx="27" cy="64" r="6.500" fill={SKIN_SHADE} stroke={INK} strokeWidth="2.200" />
                <circle cx="93" cy="64" r="6.500" fill={SKIN_SHADE} stroke={INK} strokeWidth="2.200" />
                <ellipse cx="60" cy="65" rx="33" ry="32" fill={spec.face ?? SKIN} stroke={INK} strokeWidth="2.600" />
                <ellipse cx="39" cy="74" rx="6" ry="4" fill="#f08a7c" opacity="0.450" />
                <ellipse cx="81" cy="74" rx="6" ry="4" fill="#f08a7c" opacity="0.450" />

                {/* Doppa */}
                <path d="M27 47 L34 21 Q60 11 86 21 L93 47 Q60 37 27 47 Z" fill={CAP} stroke={INK} strokeWidth="2.600" strokeLinejoin="round" />
                <path d="M28.500 44 Q60 34 91.500 44" stroke={GOLD} strokeWidth="3" fill="none" />
                {[
                    [45, 30, -18],
                    [60, 26, 0],
                    [75, 30, 18],
                ].map(([x, y, turn]) => (
                    <path key={x} d="M0 -5 C4 -3 4 3 0 5 C-4 3 -4 -3 0 -5 Z" fill="#fff" transform={`translate(${x} ${y}) rotate(${turn})`} />
                ))}

                {BROWS[spec.brows ?? 'none']}
                {EYES[spec.eyes]}
                {/* Moustache */}
                <path d="M47 77 Q53 71 60 75 Q67 71 73 77 Q66 79 60 77 Q54 79 47 77 Z" fill={INK} />
                {MOUTH[spec.mouth]}
            </g>
            {EXTRAS[spec.extra]}
            <text
                x="60"
                y="117"
                textAnchor="middle"
                fontSize="16"
                fontWeight="800"
                fill="#fff"
                stroke="#0b2b22"
                strokeWidth="4.500"
                strokeLinejoin="round"
                paintOrder="stroke"
                fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
            >
                {spec.caption}
            </text>
        </svg>
    );
}

/** Shows whatever a player sent: a sticker from the pack, or a plain emoji. */
export function Reaction({ value }: { value: string }) {
    return isSticker(value) ? <Sticker id={value} /> : <>{value}</>;
}
