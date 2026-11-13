import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalSession, MOMENT_HOLD_MS, TRICK_HOLD_MS, TableStore, fanSlot, measureLayout, type Cue, type TableEffects } from './index';

/** Records every sound and vibration the table asks for. */
function recorder() {
    const cues: Cue[] = [];
    const deals: number[] = [];
    const effects: TableEffects = {
        play: (cue) => cues.push(cue),
        deal: (cards) => deals.push(cards),
        haptic: () => {},
    };
    return { cues, deals, effects };
}

describe('TableStore', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('shows the room and our cards as soon as it connects', () => {
        const session = new LocalSession({ name: 'Расул', seed: 7 });
        const store = new TableStore(session);
        store.connect();

        const table = store.getSnapshot();
        expect(table.room?.seats.map((s) => s.name)).toEqual(['Расул', 'Алим', 'Дильназ', 'Ильхам']);
        expect(table.view?.hand).toHaveLength(5);
        expect(table.view?.phase).toBe('choosingTrump');
        session.dispose();
    });

    it('keeps a finished trick on the table for a moment, then sweeps it away with a sound', () => {
        const { cues, effects } = recorder();
        const session = new LocalSession({ name: 'Расул', seed: 3, demo: true });
        const store = new TableStore(session, effects);
        store.connect();

        // Let the bots play until the first trick is won.
        while (!store.getSnapshot().view?.lastTrick) vi.advanceTimersToNextTimer();
        const won = store.getSnapshot();
        expect(won.tablePlays).toHaveLength(4);
        expect(won.collectTo).toBe(won.view?.lastTrick?.winner);
        expect(cues).not.toContain('trick');

        vi.advanceTimersByTime(TRICK_HOLD_MS);
        expect(store.getSnapshot().tablePlays).toEqual([]);
        expect(cues).toContain('trick');
        session.dispose();
        store.disconnect();
    });

    it('waits for the last trick to clear before showing the result', () => {
        const { cues, effects } = recorder();
        const session = new LocalSession({ name: 'Расул', seed: 5, demo: true });
        const store = new TableStore(session, effects);
        store.connect();

        while (store.getSnapshot().view?.phase !== 'handOver' && store.getSnapshot().view?.phase !== 'matchOver') {
            vi.advanceTimersToNextTimer();
        }
        expect(store.getSnapshot().resultVisible).toBe(false);
        // A hand that ends on a key moment is held a little longer.
        vi.advanceTimersByTime(TRICK_HOLD_MS + MOMENT_HOLD_MS);
        expect(store.getSnapshot().resultVisible).toBe(true);
        vi.advanceTimersByTime(300);
        expect(cues.some((cue) => cue === 'handWin' || cue === 'handLose')).toBe(true);
        session.dispose();
        store.disconnect();
    });

    it('deals in two steps: five cards, then the rest once trump is named', () => {
        const { deals, effects } = recorder();
        const session = new LocalSession({ name: 'Расул', seed: 9, demo: true });
        const store = new TableStore(session, effects);
        store.connect();
        expect(deals).toEqual([5]);

        while (!store.getSnapshot().view?.trump) vi.advanceTimersToNextTimer();
        vi.advanceTimersByTime(500);
        expect(deals).toEqual([5, 8]);
        session.dispose();
        store.disconnect();
    });

    it('shows an emote for a while, then hides it', () => {
        const session = new LocalSession({ name: 'Расул', seed: 1 });
        const store = new TableStore(session);
        store.connect();

        session.emote('🔥');
        expect(store.getSnapshot().emotes[0]?.emote).toBe('🔥');
        vi.advanceTimersByTime(5000);
        expect(store.getSnapshot().emotes[0]).toBeUndefined();
        session.dispose();
    });

    it('returns the same snapshot until something changes, and tells subscribers when it does', () => {
        const session = new LocalSession({ name: 'Расул', seed: 1 });
        const store = new TableStore(session);
        store.connect();
        const listener = vi.fn();
        store.subscribe(listener);

        expect(store.getSnapshot()).toBe(store.getSnapshot());
        const before = store.getSnapshot();
        session.emote('👍');
        expect(listener).toHaveBeenCalled();
        expect(store.getSnapshot()).not.toBe(before);
        session.dispose();
    });

    it('can disconnect and reconnect without losing the table (React StrictMode does this)', () => {
        const { cues, effects } = recorder();
        const session = new LocalSession({ name: 'Расул', seed: 7 });
        const store = new TableStore(session, effects);
        store.connect();
        store.disconnect();
        store.connect();

        expect(store.getSnapshot().view?.hand).toHaveLength(5);
        // The replay on reconnect carries no events, so nothing is played twice.
        expect(cues).toEqual([]);
        session.dispose();
    });
});

describe('layout', () => {
    it('fans a phone hand symmetrically, flatter than on a desktop', () => {
        const phone = measureLayout(390, 844);
        const desktop = measureLayout(1280, 800);
        expect(phone.compact).toBe(true);
        expect(fanSlot(0, 13, phone).x).toBeCloseTo(-fanSlot(12, 13, phone).x);
        expect(fanSlot(6, 13, phone)).toEqual({ x: 0, y: 0, rotate: 0 });
        expect(Math.abs(fanSlot(0, 13, phone).rotate)).toBeLessThan(Math.abs(fanSlot(0, 13, desktop).rotate));
    });
});
