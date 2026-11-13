import type { Card, GameEvent, PlayerView, Seat, Suit } from '@cort/engine';
import type { RoomInfo } from '@cort/protocol';

/** The clock on a person's move, in this device's own time. */
export interface TurnClock {
    seat: Seat;
    /** When the time runs out, as a `Date.now()` timestamp. */
    endsAt: number;
    /** The whole allowance for the move, in ms. */
    total: number;
}

export type SessionEvent =
    /**
     * `seat` is where we sit. While `watching`, we have no seat and no cards:
     * `seat` is then only the side of the table we look from.
     */
    | { type: 'room'; room: RoomInfo; seat: Seat; watching?: boolean; spectatorId?: number }
    | { type: 'update'; view: PlayerView; events: GameEvent[]; timer?: TurnClock | null }
    /** From a player (`seat`) or from a spectator (`seat` is null, `spectator` is their id). */
    | { type: 'emote'; seat: Seat | null; emote: string; spectator?: number }
    | { type: 'error'; message: string }
    | { type: 'connection'; online: boolean }
    /** The room is gone for us (it no longer exists, or it is full): there is nothing to return to. */
    | { type: 'closed'; message: string };

/**
 * Everything a game screen needs from "a room I am in".
 * The offline game and the network game implement the same interface,
 * so the UI does not know or care which one it is talking to.
 */
export interface Session {
    /** New subscribers immediately receive the current room and view. */
    subscribe(listener: (event: SessionEvent) => void): () => void;
    start(): void;
    /** Move to a free seat (before the start), or sit down if we were only watching. */
    sit(seat: Seat): void;
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
    private lastUpdate: Extract<SessionEvent, { type: 'update' }> | null = null;

    subscribe(listener: (event: SessionEvent) => void): () => void {
        this.listeners.add(listener);
        if (this.lastRoom) listener(this.lastRoom);
        if (this.lastUpdate) listener({ ...this.lastUpdate, events: [] });
        return () => this.listeners.delete(listener);
    }

    protected emit(event: SessionEvent): void {
        if (event.type === 'room') this.lastRoom = event;
        if (event.type === 'update') this.lastUpdate = event;
        this.listeners.forEach((listener) => listener(event));
    }
}
