import type { Action, GameEvent, PlayerView, Seat } from '@cort/engine';

export interface SeatInfo {
    seat: Seat;
    name: string;
    kind: 'human' | 'bot' | 'empty';
    connected: boolean;
    /** A picture for the seat: see `Avatar`. Absent for bots, empty seats and guests. */
    avatar?: string | null;
    /** Signed in, as opposed to playing as a guest. */
    member?: boolean;
    /** Ran out of time on their last move: until they play again, their moves are made quickly for them. */
    idle?: boolean;
}

/** Someone watching the table without a seat. */
export interface SpectatorInfo {
    id: number;
    name: string;
    avatar: string | null;
}

export interface RoomInfo {
    code: string;
    title: string;
    /** Listed publicly, so anyone can join; otherwise by link or code only. */
    open: boolean;
    seats: SeatInfo[];
    host: Seat;
    started: boolean;
    spectators: SpectatorInfo[];
}

/** One line of the public list of tables. */
export interface RoomSummary {
    code: string;
    title: string;
    host: string;
    /** People at the table, out of four. */
    players: number;
    started: boolean;
    spectators: number;
}

export const MAX_TITLE = 24;
export const MAX_NAME = 16;
export const MAX_SPECTATORS = 12;

/**
 * An avatar is a short string: `preset:<n>` for one of the pictures that
 * ship with the client, or an https address of a photo.
 */
export const AVATAR_PRESETS = 16;
export const presetAvatar = (index: number): string => `preset:${index}`;
export function presetIndex(avatar: string | null | undefined): number | null {
    const match = /^preset:(\d{1,2})$/.exec(avatar ?? '');
    if (!match) return null;
    const index = Number(match[1]);
    return index < AVATAR_PRESETS ? index : null;
}

export const EMOTES = ['👍', '👏', '🤝', '🙏', '😂', '😎', '🤔', '😱', '😭', '😡', '😴', '🤡', '🔥', '💪', '🎉', '❤️'] as const;

/** The game's own sticker pack; the art lives in the client. */
export const STICKERS = ['nice', 'wow', 'lol', 'hmm', 'sad', 'angry', 'hurry', 'trump', 'thanks'] as const;
export type StickerId = (typeof STICKERS)[number];

/** The meme pack: animated stickers stored with the client as files 0 … MEME_COUNT - 1. */
export const MEME_COUNT = 50;
export const memeId = (index: number): string => `meme:${index}`;
/** The index of a meme reaction, or null if the value is not one. */
export function memeIndex(value: string): number | null {
    const match = /^meme:(\d{1,3})$/.exec(value);
    if (!match) return null;
    const index = Number(match[1]);
    return index < MEME_COUNT ? index : null;
}

/** Everything a player may send as a reaction: a meme, a sticker id or an emoji. */
export const isReaction = (value: unknown): value is string =>
    typeof value === 'string' &&
    (memeIndex(value) !== null || (STICKERS as readonly string[]).includes(value) || (EMOTES as readonly string[]).includes(value));

/** The clock on a person's move. */
export interface TurnTimer {
    seat: Seat;
    /** Time left when the message was sent, in ms. */
    left: number;
    /** The whole allowance for the move, in ms. */
    total: number;
}

/** Client → server. The server always decides the seat; it never trusts one from the client. */
export type ClientMessage =
    /** `device` identifies a guest's device, so their games can be moved to an account later. */
    | { type: 'create'; name: string; title?: string; open?: boolean; device?: string }
    /**
     * `token` lets a player take their seat back after a reconnect.
     * `watch` asks for a place among the spectators instead of a seat.
     */
    | { type: 'join'; code: string; name: string; token?: string; watch?: boolean; device?: string }
    /** Before the start: move to a free seat. A spectator may also take a seat a bot is playing. */
    | { type: 'sit'; seat: Seat }
    /** Host only: fill empty seats with bots and deal. */
    | { type: 'start' }
    | { type: 'action'; action: Action }
    | { type: 'rematch' }
    | { type: 'emote'; emote: string };

/** Server → client. */
export type ServerMessage =
    /** Sent on entering and again whenever our place changes. `seat` is null while we only watch. */
    | { type: 'joined'; code: string; seat: Seat | null; token: string; spectator?: number }
    | { type: 'room'; room: RoomInfo }
    | { type: 'update'; view: PlayerView; events: GameEvent[]; timer?: TurnTimer | null }
    /** From a player (`seat`) or from a spectator (`seat` is null, `spectator` is their id). */
    | { type: 'emote'; seat: Seat | null; emote: string; spectator?: number }
    | { type: 'error'; code: ErrorCode; message: string };

export type ErrorCode =
    | 'badMessage'
    | 'roomNotFound'
    | 'roomFull'
    | 'notHost'
    | 'notInRoom'
    | 'illegalAction'
    /** Only for people who have signed in. */
    | 'authRequired'
    | 'seatTaken'
    /** The same account entered the table from somewhere else. */
    | 'replaced';

/* ───────── HTTP API ───────── */

/** The signed-in person, as they see themselves. */
export interface Account {
    id: string;
    name: string;
    /** What others see: a preset, a photo address, or null for just the initial. */
    avatar: string | null;
    /** The photo that came with the Google account, if any; offered as one of the avatar choices. */
    photo: string | null;
    email: string | null;
}

/** GET /api/me */
export interface MeResponse {
    account: Account | null;
    /** How this server lets people sign in. */
    signIn: { googleClientId: string | null; dev: boolean };
}

export interface MatchPlayer {
    seat: Seat;
    name: string;
    kind: 'human' | 'bot';
    avatar: string | null;
    /** True for the person asking. */
    me: boolean;
}

export interface MatchHand {
    caller: Seat;
    trump: string | null;
    /** Tricks per team. */
    tricks: [number, number];
    winner: 0 | 1;
}

export interface MatchSummary {
    id: string;
    endedAt: string;
    /** In seconds. */
    duration: number;
    mySeat: Seat;
    won: boolean;
    /** Hands won per team. */
    score: [number, number];
    players: MatchPlayer[];
    hands: MatchHand[];
}

export interface PlayerStats {
    matches: number;
    wins: number;
    hands: number;
    handsWon: number;
    /** Hands our team won without giving away a single trick. */
    dryWins: number;
    /** Hands in which we named trump. */
    calls: number;
}

/** Our record with or against one particular person. */
export interface Rival {
    name: string;
    avatar: string | null;
    together: { matches: number; wins: number };
    against: { matches: number; wins: number };
}

/** GET /api/history */
export interface HistoryResponse {
    stats: PlayerStats;
    matches: MatchSummary[];
    rivals: Rival[];
}
