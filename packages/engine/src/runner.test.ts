import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apply, createGame, GameRunner, legalCards, RuleError, type Action, type GameEvent, type GameState, type Seat } from './index';

describe('GameRunner', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('plays a whole match by itself when every seat is a bot', () => {
        const events: GameEvent[] = [];
        const runner = new GameRunner({
            bots: [true, true, true, true],
            rules: { matchTarget: 2 },
            onUpdate: (_state, batch) => events.push(...batch),
        });
        runner.start(11);
        vi.runAllTimers();

        expect(runner.state?.phase).toBe('matchOver');
        expect(events.filter((e) => e.type === 'handDealt').length).toBeGreaterThanOrEqual(2);
        expect(events[events.length - 1].type).toBe('matchWon');
    });

    it('waits for a human, then carries on with the bots', () => {
        let state!: GameState;
        const runner = new GameRunner({
            bots: [false, true, true, true],
            onUpdate: (next) => (state = next),
        });
        runner.start(4);

        for (let guard = 0; state.phase !== 'handOver' && state.phase !== 'matchOver'; guard++) {
            if (guard > 200) throw new Error('Hand did not finish');
            vi.runOnlyPendingTimers();
            if (state.phase === 'choosingTrump' && state.caller === 0) {
                runner.act({ type: 'chooseTrump', seat: 0, suit: 'spades' });
            } else if (state.phase === 'playing' && state.turn === 0) {
                // Nothing happens until the human moves.
                const before = state;
                vi.advanceTimersByTime(60_000);
                expect(state).toBe(before);
                runner.act({ type: 'playCard', seat: 0, card: legalCards(state.hands[0], state.trick)[0] });
            }
        }
        expect(state.handWinner).not.toBeNull();
    });

    it('rejects illegal actions without disturbing the game', () => {
        let state!: GameState;
        const runner = new GameRunner({ bots: [false, false, false, false], onUpdate: (next) => (state = next) });
        runner.start(4);
        const before = state;
        const notCaller = ((state.caller + 1) % 4) as Seat;
        expect(() => runner.act({ type: 'chooseTrump', seat: notCaller, suit: 'hearts' })).toThrow(RuleError);
        expect(state).toBe(before);
    });

    it('stops moving after dispose', () => {
        const onUpdate = vi.fn();
        const runner = new GameRunner({ bots: [true, true, true, true], onUpdate });
        runner.start(1);
        runner.dispose();
        vi.runAllTimers();
        expect(onUpdate).toHaveBeenCalledTimes(1);
    });

    it('puts a person on the clock, and moves for them when it runs out', () => {
        let state!: GameState;
        const timedOut: Seat[] = [];
        const runner = new GameRunner({
            bots: [false, false, false, false],
            turnLimit: () => 30_000,
            onTimeout: (seat) => timedOut.push(seat),
            onUpdate: (next) => (state = next),
        });
        runner.start(4);
        const caller = state.caller;
        expect(runner.deadline).toEqual({ seat: caller, at: Date.now() + 30_000, total: 30_000 });

        // Something unrelated happening at the table does not give the thinker more time.
        vi.advanceTimersByTime(10_000);
        runner.setBot(((caller + 1) % 4) as Seat, true);
        expect(runner.deadline?.at).toBe(Date.now() + 20_000);

        vi.advanceTimersByTime(19_999);
        expect(state.trump).toBeNull();
        vi.advanceTimersByTime(1);
        expect(state.trump).not.toBeNull();
        expect(timedOut).toEqual([caller]);
        // The caller leads, so the next clock is theirs again, and a fresh one.
        expect(runner.deadline).toEqual({ seat: caller, at: Date.now() + 30_000, total: 30_000 });
        runner.dispose();
    });

    it('times nobody who has no limit, and no bots', () => {
        const runner = new GameRunner({
            bots: [true, true, true, true],
            turnLimit: (seat) => (seat === 0 ? null : 5000),
            onUpdate: () => {},
        });
        runner.start(4);
        expect(runner.deadline).toBeNull();
        runner.setBot(0, false);
        for (let guard = 0; runner.state!.phase !== 'handOver' && guard < 400; guard++) {
            const { phase, caller, turn, hands, trick } = runner.state!;
            if (phase === 'choosingTrump' && caller === 0) runner.act({ type: 'chooseTrump', seat: 0, suit: 'clubs' });
            else if (phase === 'playing' && turn === 0) runner.act({ type: 'playCard', seat: 0, card: legalCards(hands[0], trick)[0] });
            else vi.runOnlyPendingTimers();
            expect(runner.deadline).toBeNull();
        }
        runner.dispose();
    });

    it('freezes while paused and carries on afterwards', () => {
        const onUpdate = vi.fn();
        const runner = new GameRunner({ bots: [true, true, true, true], onUpdate });
        runner.start(1);
        runner.setPaused(true);
        vi.advanceTimersByTime(600_000);
        expect(onUpdate).toHaveBeenCalledTimes(1);

        runner.setPaused(false);
        vi.advanceTimersByTime(5000);
        expect(onUpdate.mock.calls.length).toBeGreaterThan(1);
        runner.dispose();
    });

    it('can be replayed from its seed and actions, and picked up from a saved state', () => {
        const actions: Action[] = [];
        let state!: GameState;
        const first = new GameRunner({
            bots: [true, true, true, true],
            onAction: (action) => actions.push(action),
            onUpdate: (next) => (state = next),
        });
        first.start(42);
        for (let i = 0; i < 30; i++) vi.runOnlyPendingTimers();
        first.dispose();
        const saved = structuredClone(state);
        expect(actions).toHaveLength(30);

        // The same seed and the same actions give the same game: this is what makes a stored match replayable.
        const replay = actions.reduce((game, action) => apply(game, action).state, createGame({ seed: 42 }).state);
        expect(replay).toEqual(saved);

        // A new runner picks the saved game up and plays it out.
        let resumed!: GameState;
        const second = new GameRunner({ bots: [true, true, true, true], rules: { matchTarget: 1 }, onUpdate: (next) => (resumed = next) });
        second.restore(saved);
        expect(second.state).toEqual(saved);
        vi.runAllTimers();
        expect(resumed.handNumber).toBeGreaterThanOrEqual(saved.handNumber);
        expect(resumed.phase).toBe('matchOver');
    });
});
