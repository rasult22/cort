import type { CompletedTrick, GameEvent, Play, PlayerView, Seat, Suit, Team } from '@cort/engine';
import type { RoomInfo } from '@cort/protocol';
import { useEffect, useState } from 'react';
import type { Session } from '../session/session';
import { haptic, play as playSound, playDeal } from '../sound';
import { positionOf } from './layout';

/** How long a finished trick stays on the table before it is swept away. */
const TRICK_HOLD_MS = 1150;
const TRUMP_NOTICE_MS = 1700;
const EMOTE_MS = 3400;
const ERROR_MS = 2200;
/** The rest of the deal lands a moment after trump is named. */
const REST_OF_DEAL_MS = 450;

/** Sounds come from where the player sits: left, right or centre. */
function panOf(seat: Seat, mySeat: Seat): number {
    const position = positionOf(seat, mySeat);
    return position === 'left' ? -0.55 : position === 'right' ? 0.55 : 0;
}

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
    /** Set when the table is gone and we should leave; holds the reason. */
    closed: string | null;
}

/**
 * Turns the session's stream of updates into what should be on screen right
 * now. The engine resolves a trick instantly; this hook is what gives people
 * time to see it.
 */
export function useTable(session: Session): TableState {
    const [room, setRoom] = useState<RoomInfo | null>(null);
    const [seat, setSeat] = useState<Seat>(0);
    const [view, setView] = useState<PlayerView | null>(null);
    const [held, setHeld] = useState<CompletedTrick | null>(null);
    const [collectTo, setCollectTo] = useState<Seat | null>(null);
    const [trumpNotice, setTrumpNotice] = useState<TableState['trumpNotice']>(null);
    const [emotes, setEmotes] = useState<TableState['emotes']>({});
    const [error, setError] = useState<string | null>(null);
    const [online, setOnline] = useState(true);
    const [closed, setClosed] = useState<string | null>(null);

    useEffect(() => {
        const timers = new Map<string, ReturnType<typeof setTimeout>>();
        const after = (key: string, ms: number, fn: () => void) => {
            clearTimeout(timers.get(key));
            timers.set(key, setTimeout(fn, ms));
        };
        let mySeat: Seat = 0;
        let emoteId = 0;

        const onGameEvents = (events: GameEvent[], next: PlayerView) => {
            const trickWon = events.find((e) => e.type === 'trickWon');
            for (const event of events) {
                switch (event.type) {
                    case 'handDealt':
                        clearTimeout(timers.get('hold'));
                        setHeld(null);
                        playDeal(next.hand.length);
                        break;
                    case 'trumpChosen':
                        setTrumpNotice({ seat: event.seat, suit: event.suit });
                        after('trump', TRUMP_NOTICE_MS, () => setTrumpNotice(null));
                        playSound('trump');
                        after('deal', REST_OF_DEAL_MS, () => playDeal(next.hand.length - 5));
                        break;
                    case 'cardPlayed':
                        playSound('card', { pan: panOf(event.seat, mySeat), mine: event.seat === mySeat });
                        if (event.seat === mySeat) haptic();
                        // A card of the next trick: stop showing the previous one.
                        if (!trickWon) {
                            clearTimeout(timers.get('hold'));
                            setHeld(null);
                        }
                        break;
                    case 'trickWon':
                        setHeld(event.trick);
                        setCollectTo(event.seat);
                        after('hold', TRICK_HOLD_MS, () => {
                            setHeld(null);
                            playSound('trick', { pan: panOf(event.seat, mySeat), mine: wonBy(event.team, mySeat) });
                        });
                        break;
                    case 'handWon':
                        if (next.phase === 'handOver') {
                            after('result', TRICK_HOLD_MS + 250, () => playSound(wonBy(event.team, mySeat) ? 'handWin' : 'handLose'));
                        }
                        break;
                    case 'matchWon':
                        after('result', TRICK_HOLD_MS + 250, () => playSound(wonBy(event.team, mySeat) ? 'matchWin' : 'matchLose'));
                        break;
                }
            }
            if (next.phase === 'playing' && next.turn === mySeat && events.length > 0 && !trickWon) {
                playSound('turn');
                haptic(8);
            }
        };

        const unsubscribe = session.subscribe((event) => {
            switch (event.type) {
                case 'room':
                    mySeat = event.seat;
                    setRoom(event.room);
                    setSeat(event.seat);
                    break;
                case 'update':
                    setView(event.view);
                    onGameEvents(event.events, event.view);
                    break;
                case 'emote': {
                    const id = ++emoteId;
                    setEmotes((current) => ({ ...current, [event.seat]: { id, emote: event.emote } }));
                    after(`emote${event.seat}`, EMOTE_MS, () =>
                        setEmotes((current) => (current[event.seat]?.id === id ? { ...current, [event.seat]: undefined } : current)),
                    );
                    break;
                }
                case 'error':
                    setError(event.message);
                    after('error', ERROR_MS, () => setError(null));
                    break;
                case 'connection':
                    setOnline(event.online);
                    break;
                case 'closed':
                    setClosed(event.message);
                    break;
            }
        });

        return () => {
            unsubscribe();
            timers.forEach(clearTimeout);
        };
    }, [session]);

    return {
        room,
        seat,
        view,
        tablePlays: held ? held.plays : (view?.trick.plays ?? []),
        collectTo,
        trumpNotice,
        resultVisible: !held && (view?.phase === 'handOver' || view?.phase === 'matchOver'),
        emotes,
        error,
        online,
        closed,
    };
}

const wonBy = (team: Team, seat: Seat): boolean => team === seat % 2;
