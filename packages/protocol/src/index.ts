import type { Action, GameEvent, PlayerView, Seat } from '@cort/engine';

export interface SeatInfo {
    seat: Seat;
    name: string;
    kind: 'human' | 'bot' | 'empty';
    connected: boolean;
}

export interface RoomInfo {
    code: string;
    title: string;
    /** Listed publicly, so anyone can join; otherwise by link or code only. */
    open: boolean;
    seats: SeatInfo[];
    host: Seat;
    started: boolean;
}

/** One line of the public list of tables. */
export interface RoomSummary {
    code: string;
    title: string;
    host: string;
    /** People at the table, out of four. */
    players: number;
    started: boolean;
}

export const MAX_TITLE = 24;

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

/** Client → server. The server always decides the seat; it never trusts one from the client. */
export type ClientMessage =
    | { type: 'create'; name: string; title?: string; open?: boolean }
    /** `token` lets a player take their seat back after a reconnect. */
    | { type: 'join'; code: string; name: string; token?: string }
    /** Host only: fill empty seats with bots and deal. */
    | { type: 'start' }
    | { type: 'action'; action: Action }
    | { type: 'rematch' }
    | { type: 'emote'; emote: string };

/** Server → client. */
export type ServerMessage =
    | { type: 'joined'; code: string; seat: Seat; token: string }
    | { type: 'room'; room: RoomInfo }
    | { type: 'update'; view: PlayerView; events: GameEvent[] }
    | { type: 'emote'; seat: Seat; emote: string }
    | { type: 'error'; code: ErrorCode; message: string };

export type ErrorCode = 'badMessage' | 'roomNotFound' | 'roomFull' | 'notHost' | 'notInRoom' | 'illegalAction';
