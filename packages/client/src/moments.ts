import { beats, partnerOf, teamOf, winningPlay, type Card, type GameEvent, type PlayerView, type Seat, type Team } from '@cort/engine';

/**
 * The moments of a hand that are worth a reaction. Each one says what
 * happened and who was involved; how to show it is up to the client.
 */
export type Moment =
    /** A trump took a trick away from an opponent's ace or king. */
    | { type: 'trumpedHigh'; seat: Seat; victim: Seat; card: Card; beaten: Card }
    /** A higher trump on top of an opponent's trump. */
    | { type: 'overtrump'; seat: Seat; victim: Seat; card: Card; beaten: Card }
    /** `partner` had the trick, an opponent took it over, and `seat` won it back. */
    | { type: 'partnerSaved'; seat: Seat; partner: Seat }
    /** A team has six tricks: `team` cannot afford to lose another one. Null when both have six. */
    | { type: 'lastChance'; team: Team | null }
    /** The trick that ended the hand. */
    | { type: 'decider'; seat: Seat; team: Team }
    /** The hand went to a team that had been `deficit` tricks behind. */
    | { type: 'comeback'; team: Team; deficit: number }
    /** The hand was won without giving away a single trick. */
    | { type: 'sweep'; team: Team };

export type MomentWeight = 'small' | 'medium' | 'big';

/** How loudly a moment should be played. Most tricks have none: that is what keeps these special. */
export function momentWeight(moment: Moment): MomentWeight {
    switch (moment.type) {
        case 'sweep':
        case 'comeback':
            return 'big';
        case 'decider':
        case 'partnerSaved':
            return 'small';
        default:
            return 'medium';
    }
}

/** When several things happen at once, the rarest one is the one to show. */
const PRIORITY: Record<Moment['type'], number> = {
    sweep: 7,
    comeback: 6,
    lastChance: 5,
    overtrump: 4,
    trumpedHigh: 3,
    partnerSaved: 2,
    decider: 1,
};

export function topMoment(moments: readonly Moment[]): Moment | null {
    return moments.reduce<Moment | null>((best, moment) => (!best || PRIORITY[moment.type] > PRIORITY[best.type] ? moment : best), null);
}

/** A comeback needs a team to have been at least this many tricks behind. */
const COMEBACK_DEFICIT = 3;

/**
 * Watches one table's stream of engine events and names the moments in it.
 * Needs no hidden information, so it works the same for players and spectators.
 */
export class MomentTracker {
    /** The deepest hole each team has been in during this hand. */
    private worst: [number, number] = [0, 0];
    /** False if we came in halfway through the hand and do not know how it went before. */
    private sawDeal = false;

    /** Call with every update, in order: the events and the view they led to. */
    observe(events: readonly GameEvent[], view: PlayerView): Moment[] {
        const moments: Moment[] = [];
        if (events.some((event) => event.type === 'handDealt')) {
            this.worst = [0, 0];
            this.sawDeal = true;
        }

        const played = events.find((event) => event.type === 'cardPlayed');
        const trickWon = events.find((event) => event.type === 'trickWon');
        const handWon = events.find((event) => event.type === 'handWon');
        const trump = view.trump;

        if (played) {
            const plays = trickWon ? trickWon.trick.plays : view.trick.plays;
            const before = plays.slice(0, -1);
            const last = plays[plays.length - 1];
            if (last && before.length > 0 && trump && last.card.suit === trump && plays[0].card.suit !== trump) {
                const top = winningPlay(before, trump);
                if (teamOf(top.seat) !== teamOf(last.seat)) {
                    const detail = { seat: last.seat, victim: top.seat, card: last.card, beaten: top.card };
                    if (top.card.suit === trump) {
                        if (beats(last.card, top.card, trump)) moments.push({ type: 'overtrump', ...detail });
                    } else if (top.card.rank === 'A' || top.card.rank === 'K') {
                        moments.push({ type: 'trumpedHigh', ...detail });
                    }
                }
            }
        }

        if (trickWon) {
            const saved = savedPartner(trickWon.trick.plays, trickWon.seat, trump);
            if (saved !== null) moments.push({ type: 'partnerSaved', seat: trickWon.seat, partner: saved });

            const [a, b] = view.tricksWon;
            this.worst = [Math.max(this.worst[0], b - a), Math.max(this.worst[1], a - b)];

            if (handWon) {
                const loser = (1 - handWon.team) as Team;
                if (handWon.tricksWon[loser] === 0) {
                    moments.push({ type: 'sweep', team: handWon.team });
                } else if (this.sawDeal && this.worst[handWon.team] >= COMEBACK_DEFICIT) {
                    moments.push({ type: 'comeback', team: handWon.team, deficit: this.worst[handWon.team] });
                }
                moments.push({ type: 'decider', seat: trickWon.seat, team: handWon.team });
            } else if (view.rules.stopAtSevenTricks && view.tricksWon[trickWon.team] === 6) {
                const other = (1 - trickWon.team) as Team;
                moments.push({ type: 'lastChance', team: view.tricksWon[other] === 6 ? null : other });
            }
        }

        return moments;
    }
}

/**
 * If the winner took back a trick their partner had been winning before an
 * opponent got on top of it, returns the partner's seat.
 */
function savedPartner(plays: readonly { seat: Seat; card: Card }[], winner: Seat, trump: PlayerView['trump']): Seat | null {
    const partner = partnerOf(winner);
    const winnerAt = plays.findIndex((play) => play.seat === winner);
    const partnerAt = plays.findIndex((play) => play.seat === partner);
    if (partnerAt < 0 || partnerAt > winnerAt) return null;

    const partnerWasOnTop = winningPlay(plays.slice(0, partnerAt + 1), trump).seat === partner;
    const topBeforeWinner = winningPlay(plays.slice(0, winnerAt), trump);
    return partnerWasOnTop && teamOf(topBeforeWinner.seat) !== teamOf(winner) ? partner : null;
}
