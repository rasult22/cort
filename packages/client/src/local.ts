import { GameRunner, RuleError, viewFor, type Card, type RunnerDelays, type Rules, type Seat, type Suit } from '@cort/engine';
import type { RoomInfo } from '@cort/protocol';
import { BaseSession, type Session } from './session';

const BOT_NAMES = ['Алим', 'Дильназ', 'Ильхам'];
const MY_SEAT: Seat = 0;

export interface LocalOptions {
    name: string;
    seed?: number;
    /** Let a bot play our seat too (handy for demos and testing). */
    demo?: boolean;
    delays?: Partial<RunnerDelays>;
    rules?: Partial<Rules>;
}

/** A room that lives entirely on this device: you and three bots. */
export class LocalSession extends BaseSession implements Session {
    private readonly runner: GameRunner;
    private readonly room: RoomInfo;
    private seed: number;
    private dealt = false;

    constructor(options: LocalOptions) {
        super();
        this.seed = options.seed ?? randomSeed();
        this.room = {
            code: '',
            title: '',
            open: false,
            host: MY_SEAT,
            started: true,
            seats: [options.name, ...BOT_NAMES].map((name, seat) => ({
                seat: seat as Seat,
                name,
                kind: seat === MY_SEAT ? 'human' : 'bot',
                connected: true,
            })),
        };
        this.runner = new GameRunner({
            bots: [options.demo === true, true, true, true],
            delays: options.delays,
            rules: options.rules,
            onUpdate: (state, events) => this.emit({ type: 'update', view: viewFor(state, MY_SEAT), events }),
        });
        this.emit({ type: 'room', room: this.room, seat: MY_SEAT });
    }

    /** The first deal waits for the first listener, so a screen sees (and hears) it happen. */
    override subscribe(listener: Parameters<BaseSession['subscribe']>[0]): () => void {
        const unsubscribe = super.subscribe(listener);
        this.start();
        return unsubscribe;
    }

    start(): void {
        if (this.dealt) return;
        this.dealt = true;
        this.runner.start(this.seed);
    }

    chooseTrump(suit: Suit): void {
        this.attempt(() => this.runner.act({ type: 'chooseTrump', seat: MY_SEAT, suit }));
    }

    playCard(card: Card): void {
        this.attempt(() => this.runner.act({ type: 'playCard', seat: MY_SEAT, card }));
    }

    rematch(): void {
        this.seed = randomSeed();
        this.runner.start(this.seed);
    }

    emote(emote: string): void {
        this.emit({ type: 'emote', seat: MY_SEAT, emote });
    }

    dispose(): void {
        this.runner.dispose();
    }

    private attempt(action: () => void): void {
        try {
            action();
        } catch (error) {
            if (!(error instanceof RuleError)) throw error;
            this.emit({ type: 'error', message: error.message });
        }
    }
}

function randomSeed(): number {
    return (Math.random() * 0x7fffffff) | 0;
}
