import type { Action, GameEvent, PlayerView, Seat } from '@cort/engine';

export interface SeatInfo {
    seat: Seat;
    name: string;
    kind: 'human' | 'bot' | 'empty';
    connected: boolean;
}

export interface RoomInfo {
    code: string;
    seats: SeatInfo[];
    host: Seat;
    started: boolean;
}

export const EMOTES = ['👍', '😂', '😎', '🤔', '😱', '🔥'] as const;

/** Client → server. The server always decides the seat; it never trusts one from the client. */
export type ClientMessage =
    | { type: 'create'; name: string }
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
