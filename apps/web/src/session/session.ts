import type { Card, GameEvent, PlayerView, Seat, Suit } from '@cort/engine';
import type { RoomInfo } from '@cort/protocol';

export type SessionEvent =
    | { type: 'room'; room: RoomInfo; seat: Seat }
    | { type: 'update'; view: PlayerView; events: GameEvent[] }
    | { type: 'emote'; seat: Seat; emote: string }
    | { type: 'error'; message: string }
    | { type: 'connection'; online: boolean };

/**
 * Everything the game screen needs from "a table I am sitting at".
 * The offline game and the network game implement the same interface,
 * so the UI does not know or care which one it is talking to.
 */
export interface Session {
    /** New subscribers immediately receive the current room and view. */
    subscribe(listener: (event: SessionEvent) => void): () => void;
    start(): void;
    chooseTrump(suit: Suit): void;
    playCard(card: Card): void;
    rematch(): void;
    emote(emote: string): void;
    dispose(): void;
}

/** Shared plumbing: listeners plus replay of the latest room and view. */
export abstract class BaseSession {
    private listeners = new Set<(event: SessionEvent) => void>();
    private lastRoom: Extract<SessionEvent, { type: 'room' }> | null = null;
    private lastView: PlayerView | null = null;

    subscribe(listener: (event: SessionEvent) => void): () => void {
        this.listeners.add(listener);
        if (this.lastRoom) listener(this.lastRoom);
        if (this.lastView) listener({ type: 'update', view: this.lastView, events: [] });
        return () => this.listeners.delete(listener);
    }

    protected emit(event: SessionEvent): void {
        if (event.type === 'room') this.lastRoom = event;
        if (event.type === 'update') this.lastView = event.view;
        this.listeners.forEach((listener) => listener(event));
    }
}
