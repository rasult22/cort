import type { CompletedTrick, GameEvent, Play, PlayerView, Seat, Suit, Team } from '@cort/engine';
import type { RoomInfo } from '@cort/protocol';
import { positionOf } from './layout';
import { MomentTracker, momentWeight, topMoment, type Moment } from './moments';
import type { Session, TurnClock } from './session';

/** How long a finished trick stays on the table before it is swept away. */
export const TRICK_HOLD_MS = 1150;
const TRUMP_NOTICE_MS = 1700;
const EMOTE_MS = 3400;
const ERROR_MS = 2200;
/** The rest of the deal lands a moment after trump is named. */
const REST_OF_DEAL_MS = 450;
/** The result sound waits until the last trick has been swept away. */
const RESULT_DELAY_MS = TRICK_HOLD_MS + 250;
/** A trick with a moment in it is held a little longer, so the moment can land. */
export const MOMENT_HOLD_MS = 650;
const MOMENT_MS = { small: 1300, medium: 1900, big: 2800 };
/** A reaction thrown while a moment is on screen sticks around this many times longer. */
const STICKY_EMOTE = 2;
/** With this much time left on our own move, the table nudges us. */
const HURRY_MS = 5000;

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
    /** A key moment of the hand. `ours` is true or false for the two teams, null for someone only watching. */
    moment?(moment: Moment, ours: boolean | null): void;
}

export const SILENT: TableEffects = { play() {}, deal() {}, haptic() {} };

export interface Emote {
    id: number;
    emote: string;
    /** Thrown during a key moment: it stays on the table longer. */
    sticky?: boolean;
}

export interface ActiveMoment {
    id: number;
    moment: Moment;
}

export interface TableState {
    room: RoomInfo | null;
    /** Our seat. While `watching`, only the side of the table we look from. */
    seat: Seat;
    /** We have no seat and no cards: we are a spectator. */
    watching: boolean;
    /** Our id among the spectators, while watching. */
    spectatorId: number | null;
    view: PlayerView | null;
    /** The clock on the current move, if it is a person's and they are being timed. */
    timer: TurnClock | null;
    /** The key moment being played right now. */
    moment: ActiveMoment | null;
    /** Cards to draw in the middle: the live trick, or the one just finished. */
    tablePlays: Play[];
    /** Who took the last trick: the cards fly off towards them. */
    collectTo: Seat | null;
    trumpNotice: { seat: Seat; suit: Suit } | null;
    /** True once the last trick has been cleared and the result can be shown. */
    resultVisible: boolean;
    emotes: Partial<Record<Seat, Emote>>;
    /** Reactions from the spectators, by spectator id. */
    spectatorEmotes: Record<number, Emote>;
    error: string | null;
    online: boolean;
    /** Set when the room is gone and we should leave; holds the reason. */
    closed: string | null;
}

interface Inner {
    room: RoomInfo | null;
    seat: Seat;
    watching: boolean;
    spectatorId: number | null;
    view: PlayerView | null;
    timer: TurnClock | null;
    moment: ActiveMoment | null;
    spectatorEmotes: TableState['spectatorEmotes'];
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
const teamOfSeat = (seat: Seat): Team => (seat % 2) as Team;

/**
 * Turns a session's stream of updates into what should be on screen right
 * now. The engine resolves a trick instantly; this is what gives people time
 * to see it. Framework-free: React reads it with useSyncExternalStore.
 */
export class TableStore {
    private inner: Inner = {
        room: null,
        seat: 0,
        watching: false,
        spectatorId: null,
        view: null,
        timer: null,
        moment: null,
        spectatorEmotes: {},
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
    private momentId = 0;
    private moments = new MomentTracker();

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
                    this.set({
                        room: event.room,
                        seat: event.seat,
                        watching: event.watching === true,
                        spectatorId: event.spectatorId ?? null,
                    });
                    break;
                case 'update':
                    this.set({ view: event.view, timer: event.timer ?? null });
                    this.onGameEvents(event.events, event.view);
                    this.watchClock();
                    break;
                case 'emote':
                    this.onEmote(event.seat, event.spectator, event.emote);
                    break;
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

    private onEmote(seat: Seat | null, spectator: number | undefined, emote: string): void {
        const id = ++this.emoteId;
        const sticky = this.inner.moment !== null;
        const shown: Emote = sticky ? { id, emote, sticky } : { id, emote };
        const ms = EMOTE_MS * (sticky ? STICKY_EMOTE : 1);
        if (seat !== null) {
            this.set({ emotes: { ...this.inner.emotes, [seat]: shown } });
            this.after(`emote${seat}`, ms, () => {
                if (this.inner.emotes[seat]?.id === id) this.set({ emotes: { ...this.inner.emotes, [seat]: undefined } });
            });
        } else if (spectator !== undefined) {
            this.set({ spectatorEmotes: { ...this.inner.spectatorEmotes, [spectator]: shown } });
            this.after(`watcher${spectator}`, ms, () => {
                if (this.inner.spectatorEmotes[spectator]?.id !== id) return;
                const { [spectator]: _gone, ...rest } = this.inner.spectatorEmotes;
                this.set({ spectatorEmotes: rest });
            });
        }
    }

    /** Nudges us when our own time is about to run out. */
    private watchClock(): void {
        this.cancel('hurry');
        const { timer, seat, watching } = this.inner;
        if (!timer || watching || timer.seat !== seat) return;
        const wait = timer.endsAt - Date.now() - HURRY_MS;
        if (wait <= 0) return;
        this.after('hurry', wait, () => {
            this.effects.play('turn');
            this.effects.haptic(30);
        });
    }

    /** Puts the most telling moment of this update on screen, if there is one. */
    private showMoment(found: Moment[]): Moment | null {
        const moment = topMoment(found);
        if (!moment) return null;
        const id = ++this.momentId;
        this.set({ moment: { id, moment } });
        this.after('moment', MOMENT_MS[momentWeight(moment)], () => {
            if (this.inner.moment?.id === id) this.set({ moment: null });
        });
        const team = 'team' in moment ? moment.team : teamOfSeat(moment.seat);
        const ours = this.inner.watching || team === null ? null : wonBy(team, this.inner.seat);
        this.effects.moment?.(moment, ours);
        return moment;
    }

    private onGameEvents(events: GameEvent[], next: PlayerView): void {
        const me = this.inner.seat;
        const watching = this.inner.watching;
        const fx = this.effects;
        const trickWon = events.find((e) => e.type === 'trickWon');
        const moment = events.length > 0 ? this.showMoment(this.moments.observe(events, next)) : null;
        const hold = TRICK_HOLD_MS + (moment && momentWeight(moment) !== 'small' ? MOMENT_HOLD_MS : 0);
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
                    fx.play('card', { pan: panOf(event.seat, me), mine: !watching && event.seat === me });
                    if (!watching && event.seat === me) fx.haptic();
                    // A card of the next trick: stop showing the previous one.
                    if (!trickWon) {
                        this.cancel('hold');
                        this.set({ held: null });
                    }
                    break;
                case 'trickWon':
                    this.set({ held: event.trick, collectTo: event.seat });
                    this.after('hold', hold, () => {
                        this.set({ held: null });
                        fx.play('trick', { pan: panOf(event.seat, me), mine: !watching && wonBy(event.team, me) });
                    });
                    break;
                case 'handWon':
                    if (next.phase === 'handOver') {
                        const cue = watching || wonBy(event.team, me) ? 'handWin' : 'handLose';
                        this.after('result', RESULT_DELAY_MS + hold - TRICK_HOLD_MS, () => fx.play(cue));
                    }
                    break;
                case 'matchWon': {
                    const cue = watching || wonBy(event.team, me) ? 'matchWin' : 'matchLose';
                    this.after('result', RESULT_DELAY_MS + hold - TRICK_HOLD_MS, () => fx.play(cue));
                    break;
                }
            }
        }
        if (!watching && next.phase === 'playing' && next.turn === me && events.length > 0 && !trickWon) {
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
            watching: this.inner.watching,
            spectatorId: this.inner.spectatorId,
            view,
            timer: this.inner.timer,
            moment: this.inner.moment,
            spectatorEmotes: this.inner.spectatorEmotes,
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
