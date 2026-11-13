import { AVATAR_PRESETS, presetAvatar, presetIndex } from '@cort/protocol';
import { useState } from 'react';

/** The pictures a signed-in player can pick: things from the table at home, each on its own colour. */
const PRESETS: readonly (readonly [string, string])[] = [
    ['🍉', '#2f9e77'],
    ['🍇', '#7a5cc7'],
    ['🍵', '#c8683f'],
    ['🍑', '#e58a5f'],
    ['🌶️', '#b8433f'],
    ['🥟', '#c9a35a'],
    ['🐎', '#8a6a4f'],
    ['🦅', '#4f7fa8'],
    ['🐪', '#c39552'],
    ['🦊', '#d9772f'],
    ['🐯', '#d99a2b'],
    ['🦉', '#6f6aa8'],
    ['🌙', '#3f5aa8'],
    ['⭐', '#3f8fa8'],
    ['🌷', '#c7557f'],
    ['🎻', '#9a5a3f'],
];

/** Without a picture, the initial sits on a colour picked by the name, so the same person always looks the same. */
const TINTS = ['#c8683f', '#3f8fa8', '#7a5cc7', '#2f9e77', '#c7557f', '#c39552', '#4f7fa8', '#b8433f'];

function tintOf(name: string): string {
    let hash = 0;
    for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
    return TINTS[hash % TINTS.length];
}

export const ALL_PRESETS = Array.from({ length: Math.min(AVATAR_PRESETS, PRESETS.length) }, (_, index) => presetAvatar(index));

interface AvatarProps {
    name: string;
    /** A preset, a photo address, or nothing for just the initial. */
    avatar?: string | null;
    /** Nobody sits here yet. */
    empty?: boolean;
    className?: string;
}

/** A player's face at the table. Its size comes from the CSS of whatever contains it. */
export function Avatar({ name, avatar, empty, className = '' }: AvatarProps) {
    const [broken, setBroken] = useState<string | null>(null);
    const preset = presetIndex(avatar);

    if (empty) {
        return (
            <span className={`avatar empty ${className}`}>
                <i>+</i>
            </span>
        );
    }
    if (preset !== null && PRESETS[preset]) {
        const [glyph, colour] = PRESETS[preset];
        return (
            <span className={`avatar preset ${className}`} style={{ background: colour }}>
                <i>{glyph}</i>
            </span>
        );
    }
    if (avatar && /^https:\/\//.test(avatar) && broken !== avatar) {
        return (
            <span className={`avatar photo ${className}`}>
                {/* Google's photo host refuses requests that name the page they come from. */}
                <img src={avatar} alt="" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(avatar)} />
            </span>
        );
    }
    return (
        <span className={`avatar ${className}`} style={{ background: tintOf(name) }}>
            <i>{(name.trim()[0] ?? '?').toUpperCase()}</i>
        </span>
    );
}
