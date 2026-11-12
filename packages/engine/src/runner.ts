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

export interface RunnerOptions {
    rules?: Partial<Rules>;
    /** Which seats are played by bots. */
    bots: boolean[];
    delays?: Partial<RunnerDelays>;
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
    private readonly bots: boolean[];
    private readonly delays: RunnerDelays;

    constructor(private readonly options: RunnerOptions) {
        this.bots = [...options.bots];
        this.delays = { ...DEFAULT_DELAYS, ...options.delays };
    }

    get state(): GameState | null {
        return this.current;
    }

    /** Starts a fresh match (also used for a rematch). */
    start(seed: number): void {
        this.commit(createGame({ seed, rules: this.options.rules }));
    }

    /** Applies an action; throws RuleError if it is illegal. */
    act(action: Action): void {
        if (!this.current) throw new Error('The game has not started');
        this.commit(apply(this.current, action));
    }

    setBot(seat: Seat, isBot: boolean): void {
        this.bots[seat] = isBot;
        this.schedule();
    }

    dispose(): void {
        clearTimeout(this.timer);
        this.timer = null;
    }

    private commit(result: Result): void {
        this.current = result.state;
        this.schedule();
        this.options.onUpdate(result.state, result.events);
    }

    private schedule(): void {
        clearTimeout(this.timer);
        this.timer = null;
        const next = this.nextAutomaticStep();
        if (!next) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            this.act(next.action);
        }, next.delay);
    }

    private nextAutomaticStep(): { action: Action; delay: number } | null {
        const state = this.current;
        if (!state || state.phase === 'matchOver') return null;
        if (state.phase === 'handOver') return { action: { type: 'nextHand' }, delay: this.delays.nextHand };

        const seat = state.phase === 'choosingTrump' ? state.caller : state.turn;
        if (!this.bots[seat]) return null;
        const action = chooseBotAction(viewFor(state, seat));
        if (!action) return null;

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
