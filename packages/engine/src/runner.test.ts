import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameRunner, legalCards, RuleError, type GameEvent, type GameState, type Seat } from './index';

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
});
