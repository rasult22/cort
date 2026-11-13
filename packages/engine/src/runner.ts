import { chooseBotAction } from './bot';
import { apply, createGame, viewFor, type Result } from './game';
import type { Action, GameEvent, GameState, Rules, Seat } from './types';

/** Pauses (ms) before automatic steps, so people can follow what happens. */
export interface RunnerDelays {
    botTrump: number;
    /** A bot leading the very first trick, while the rest of the deal lands. */
    firstLead: number;
    botMove: number;
    /** A bot leading right after a trick, while that trick is still on show. */
    afterTrick: number;
    nextHand: number;
}

export const DEFAULT_DELAYS: RunnerDelays = {
    botTrump: 2000,
    firstLead: 1800,
    botMove: 850,
    afterTrick: 2000,
    nextHand: 5000,
};

/** A person's move that is on the clock. */
export interface TurnDeadline {
    seat: Seat;
    /** When the time runs out, as a `Date.now()` timestamp. */
    at: number;
    /** The whole allowance for this move, in ms. */
    total: number;
}

export interface RunnerOptions {
    rules?: Partial<Rules>;
    /** Which seats are played by bots. */
    bots: boolean[];
    delays?: Partial<RunnerDelays>;
    /**
     * How long (ms) the person in `seat` may think before the move is made
     * for them; null for no limit. Without this option nobody is timed.
     */
    turnLimit?: (seat: Seat) => number | null;
    /** A person ran out of time; their move is about to be made for them. */
    onTimeout?: (seat: Seat) => void;
    /** Every action that was applied, in order: with the seed, enough to replay the match. */
    onAction?: (action: Action) => void;
    onUpdate: (state: GameState, events: GameEvent[]) => void;
}

/**
 * Runs one table: owns the authoritative state, applies player actions,
 * moves the bots and deals the next hand. Used as-is by the offline game
 * and by the server, so both behave identically.
 */
export class GameRunner {
    private current: GameState | null = null;
    private timer: unknown = null;
    private paused = false;
    /** The move being timed, so that an unrelated change does not restart the clock. */
    private clock: (TurnDeadline & { key: string }) | null = null;
    private readonly bots: boolean[];
    private readonly delays: RunnerDelays;

    constructor(private readonly options: RunnerOptions) {
        this.bots = [...options.bots];
        this.delays = { ...DEFAULT_DELAYS, ...options.delays };
    }

    get state(): GameState | null {
        return this.current;
    }

    /** The move a person is being timed on right now, if any. */
    get deadline(): TurnDeadline | null {
        if (!this.clock || this.paused) return null;
        const { seat, at, total } = this.clock;
        return { seat, at, total };
    }

    /** Starts a fresh match (also used for a rematch). */
    start(seed: number): void {
        this.commit(createGame({ seed, rules: this.options.rules }));
    }

    /** Picks up a game that was saved earlier, exactly where it stopped. */
    restore(state: GameState): void {
        this.current = structuredClone(state);
        this.schedule();
    }

    /** Applies an action; throws RuleError if it is illegal. */
    act(action: Action): void {
        if (!this.current) throw new Error('The game has not started');
        const result = apply(this.current, action);
        this.options.onAction?.(action);
        this.commit(result);
    }

    setBot(seat: Seat, isBot: boolean): void {
        this.bots[seat] = isBot;
        this.schedule();
    }

    /** While paused nothing moves by itself: no bots, no clock, no next deal. */
    setPaused(paused: boolean): void {
        if (this.paused === paused) return;
        this.paused = paused;
        // The clock starts afresh for whoever was thinking when the table froze.
        this.clock = null;
        this.schedule();
    }

    dispose(): void {
        this.stopTimer();
        this.clock = null;
    }

    private commit(result: Result): void {
        this.current = result.state;
        this.schedule();
        this.options.onUpdate(result.state, result.events);
    }

    private stopTimer(): void {
        clearTimeout(this.timer);
        this.timer = null;
    }

    private schedule(): void {
        this.stopTimer();
        const next = this.paused ? null : this.nextAutomaticStep();
        if (!next) {
            this.clock = null;
            return;
        }
        this.timer = setTimeout(() => {
            this.timer = null;
            if (next.timedOut !== undefined) this.options.onTimeout?.(next.timedOut);
            this.act(next.action);
        }, next.delay);
    }

    private nextAutomaticStep(): { action: Action; delay: number; timedOut?: Seat } | null {
        const state = this.current;
        if (!state || state.phase === 'matchOver') return null;
        if (state.phase === 'handOver') {
            this.clock = null;
            return { action: { type: 'nextHand' }, delay: this.delays.nextHand };
        }

        const seat = state.phase === 'choosingTrump' ? state.caller : state.turn;
        const action = chooseBotAction(viewFor(state, seat));
        if (!action) return null;

        if (!this.bots[seat]) {
            const limit = this.options.turnLimit?.(seat) ?? null;
            if (limit === null) return null;
            // The same move as before (someone else joined or left meanwhile): the clock keeps running.
            const tricks = state.tricksWon[0] + state.tricksWon[1];
            const key = `${state.handNumber}:${state.phase}:${tricks}:${state.trick.plays.length}:${seat}`;
            if (this.clock?.key !== key) this.clock = { key, seat, at: Date.now() + limit, total: limit };
            return { action, delay: Math.max(0, this.clock.at - Date.now()), timedOut: seat };
        }

        this.clock = null;
        const leading = state.trick.plays.length === 0;
        const delay =
            state.phase === 'choosingTrump'
                ? this.delays.botTrump
                : leading && !state.lastTrick
                  ? this.delays.firstLead
                  : leading
                    ? this.delays.afterTrick
                    : this.delays.botMove;
        return { action, delay };
    }
}
