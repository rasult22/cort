import type { CompletedTrick, GameEvent, Play, PlayerView, Seat, Suit, Team } from '@cort/engine';
import type { RoomInfo } from '@cort/protocol';
import { positionOf } from './layout';
import type { Session } from './session';

/** How long a finished trick stays on the table before it is swept away. */
export const TRICK_HOLD_MS = 1150;
const TRUMP_NOTICE_MS = 1700;
const EMOTE_MS = 3400;
const ERROR_MS = 2200;
/** The rest of the deal lands a moment after trump is named. */
const REST_OF_DEAL_MS = 450;
/** The result sound waits until the last trick has been swept away. */
const RESULT_DELAY_MS = TRICK_HOLD_MS + 250;

/** Sound cues the table asks for; each client decides how they sound. */
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

/** Sound and vibration, supplied by the platform. Every method may be a no-op. */
export interface TableEffects {
    play(cue: Cue, options?: CueOptions): void;
    /** Cards being dealt to us. */
    deal(cards: number): void;
    haptic(ms?: number): void;
}

export const SILENT: TableEffects = { play() {}, deal() {}, haptic() {} };

export interface Emote {
    id: number;
    emote: string;
}

export interface TableState {
    room: RoomInfo | null;
    seat: Seat;
    view: PlayerView | null;
    /** Cards to draw in the middle: the live trick, or the one just finished. */
    tablePlays: Play[];
    /** Who took the last trick: the cards fly off towards them. */
    collectTo: Seat | null;
    trumpNotice: { seat: Seat; suit: Suit } | null;
    /** True once the last trick has been cleared and the result can be shown. */
    resultVisible: boolean;
    emotes: Partial<Record<Seat, Emote>>;
    error: string | null;
    online: boolean;
    /** Set when the room is gone and we should leave; holds the reason. */
    closed: string | null;
}

interface Inner {
    room: RoomInfo | null;
    seat: Seat;
    view: PlayerView | null;
    held: CompletedTrick | null;
    collectTo: Seat | null;
    trumpNotice: TableState['trumpNotice'];
    emotes: TableState['emotes'];
    error: string | null;
    online: boolean;
    closed: string | null;
}

/** Sounds come from where the player sits: left, right or centre. */
function panOf(seat: Seat, mySeat: Seat): number {
    const position = positionOf(seat, mySeat);
    return position === 'left' ? -0.55 : position === 'right' ? 0.55 : 0;
}

const wonBy = (team: Team, seat: Seat): boolean => team === seat % 2;

/**
 * Turns a session's stream of updates into what should be on screen right
 * now. The engine resolves a trick instantly; this is what gives people time
 * to see it. Framework-free: React reads it with useSyncExternalStore.
 */
export class TableStore {
    private inner: Inner = {
        room: null,
        seat: 0,
        view: null,
        held: null,
        collectTo: null,
        trumpNotice: null,
        emotes: {},
        error: null,
        online: true,
        closed: null,
    };
    private snapshot: TableState = this.derive();
    private listeners = new Set<() => void>();
    private timers = new Map<string, unknown>();
    private unsubscribe: (() => void) | null = null;
    private emoteId = 0;

    constructor(
        private readonly session: Session,
        private readonly effects: TableEffects = SILENT,
    ) {}

    /** Starts listening to the session. Safe to call again after disconnect(). */
    connect(): void {
        if (this.unsubscribe) return;
        this.unsubscribe = this.session.subscribe((event) => {
            switch (event.type) {
                case 'room':
                    this.set({ room: event.room, seat: event.seat });
                    break;
                case 'update':
                    this.set({ view: event.view });
                    this.onGameEvents(event.events, event.view);
                    break;
                case 'emote': {
                    const id = ++this.emoteId;
                    this.set({ emotes: { ...this.inner.emotes, [event.seat]: { id, emote: event.emote } } });
                    this.after(`emote${event.seat}`, EMOTE_MS, () => {
                        if (this.inner.emotes[event.seat]?.id === id) {
                            this.set({ emotes: { ...this.inner.emotes, [event.seat]: undefined } });
                        }
                    });
                    break;
                }
                case 'error':
                    this.set({ error: event.message });
                    this.after('error', ERROR_MS, () => this.set({ error: null }));
                    break;
                case 'connection':
                    this.set({ online: event.online });
                    break;
                case 'closed':
                    this.set({ closed: event.message });
                    break;
            }
        });
    }

    disconnect(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.timers.forEach((timer) => clearTimeout(timer));
        this.timers.clear();
    }

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getSnapshot = (): TableState => this.snapshot;

    private onGameEvents(events: GameEvent[], next: PlayerView): void {
        const me = this.inner.seat;
        const fx = this.effects;
        const trickWon = events.find((e) => e.type === 'trickWon');
        for (const event of events) {
            switch (event.type) {
                case 'handDealt':
                    this.cancel('hold');
                    this.set({ held: null });
                    fx.deal(next.hand.length);
                    break;
                case 'trumpChosen':
                    this.set({ trumpNotice: { seat: event.seat, suit: event.suit } });
                    this.after('trump', TRUMP_NOTICE_MS, () => this.set({ trumpNotice: null }));
                    fx.play('trump');
                    this.after('deal', REST_OF_DEAL_MS, () => fx.deal(next.hand.length - 5));
                    break;
                case 'cardPlayed':
                    fx.play('card', { pan: panOf(event.seat, me), mine: event.seat === me });
                    if (event.seat === me) fx.haptic();
                    // A card of the next trick: stop showing the previous one.
                    if (!trickWon) {
                        this.cancel('hold');
                        this.set({ held: null });
                    }
                    break;
                case 'trickWon':
                    this.set({ held: event.trick, collectTo: event.seat });
                    this.after('hold', TRICK_HOLD_MS, () => {
                        this.set({ held: null });
                        fx.play('trick', { pan: panOf(event.seat, me), mine: wonBy(event.team, me) });
                    });
                    break;
                case 'handWon':
                    if (next.phase === 'handOver') {
                        this.after('result', RESULT_DELAY_MS, () => fx.play(wonBy(event.team, me) ? 'handWin' : 'handLose'));
                    }
                    break;
                case 'matchWon':
                    this.after('result', RESULT_DELAY_MS, () => fx.play(wonBy(event.team, me) ? 'matchWin' : 'matchLose'));
                    break;
            }
        }
        if (next.phase === 'playing' && next.turn === me && events.length > 0 && !trickWon) {
            fx.play('turn');
            fx.haptic(8);
        }
    }

    private set(patch: Partial<Inner>): void {
        this.inner = { ...this.inner, ...patch };
        this.snapshot = this.derive();
        this.listeners.forEach((listener) => listener());
    }

    private derive(): TableState {
        const { held, view } = this.inner;
        return {
            room: this.inner.room,
            seat: this.inner.seat,
            view,
            tablePlays: held ? held.plays : (view?.trick.plays ?? []),
            collectTo: this.inner.collectTo,
            trumpNotice: this.inner.trumpNotice,
            resultVisible: !held && (view?.phase === 'handOver' || view?.phase === 'matchOver'),
            emotes: this.inner.emotes,
            error: this.inner.error,
            online: this.inner.online,
            closed: this.inner.closed,
        };
    }

    private after(key: string, ms: number, fn: () => void): void {
        this.cancel(key);
        this.timers.set(
            key,
            setTimeout(() => {
                this.timers.delete(key);
                fn();
            }, ms),
        );
    }

    private cancel(key: string): void {
        clearTimeout(this.timers.get(key));
        this.timers.delete(key);
    }
}
