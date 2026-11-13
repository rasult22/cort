import { momentWeight, type ActiveMoment, type Moment } from '@cort/client';
import type { Seat, Team } from '@cort/engine';
import type { RoomInfo } from '@cort/protocol';
import { AnimatePresence, motion } from 'motion/react';

interface MomentBannerProps {
    active: ActiveMoment | null;
    room: RoomInfo;
    /** Our seat; while watching, nobody's side is ours. */
    seat: Seat;
    watching: boolean;
}

interface Wording {
    title: string;
    detail?: string;
    /** Whose moment it is, from where we sit: sets the colour. */
    side: 'ours' | 'theirs' | 'neutral';
}

const RANK_NAMES: Record<string, string> = { A: 'туза', K: 'короля' };

/** Says what happened in words, from the point of view of whoever is looking. */
function describe(moment: Moment, room: RoomInfo, seat: Seat, watching: boolean): Wording | null {
    const nameOf = (s: Seat) => room.seats[s]?.name ?? '';
    const who = (s: Seat) => (!watching && s === seat ? 'Вы' : nameOf(s));
    const sideOf = (team: Team): Wording['side'] => (watching ? 'neutral' : team === seat % 2 ? 'ours' : 'theirs');
    const pair = (team: Team) => `${nameOf(team as Seat)} и ${nameOf((team + 2) as Seat)}`;
    const mine = (s: Seat) => !watching && s === seat;

    switch (moment.type) {
        case 'trumpedHigh':
            return {
                title: `${who(moment.seat)} ${mine(moment.seat) ? 'бьёте' : 'бьёт'} ${RANK_NAMES[moment.beaten.rank] ?? 'карту'} козырем!`,
                side: sideOf((moment.seat % 2) as Team),
            };
        case 'overtrump':
            return {
                title: `${who(moment.seat)} ${mine(moment.seat) ? 'перебиваете' : 'перебивает'} козырь!`,
                detail: 'козырь на козырь',
                side: sideOf((moment.seat % 2) as Team),
            };
        case 'partnerSaved':
            // A quiet one, and only for the two people it is about.
            if (mine(moment.partner)) return { title: 'Напарник спас взятку', side: 'ours' };
            if (mine(moment.seat)) return { title: 'Вы спасли взятку', side: 'ours' };
            return null;
        case 'lastChance':
            if (moment.team === null) return { title: 'Решающая взятка', detail: '6 : 6 — кто возьмёт, тот и выиграл', side: 'neutral' };
            if (watching) return { title: 'Одна взятка до победы', detail: `у пары ${pair((1 - moment.team) as Team)} уже шесть`, side: 'neutral' };
            return moment.team === seat % 2
                ? { title: 'Последний шанс', detail: 'у соперников шесть взяток — ошибаться нельзя', side: 'theirs' }
                : { title: 'Одна взятка до победы', detail: 'у нас уже шесть', side: 'ours' };
        case 'comeback':
            return {
                title: 'Камбэк!',
                detail: watching ? `${pair(moment.team)} отыгрались с −${moment.deficit}` : `отыгрались с −${moment.deficit}`,
                side: sideOf(moment.team),
            };
        case 'sweep':
            return { title: 'Сухая победа!', detail: watching ? `${pair(moment.team)} — 7 : 0` : '7 : 0', side: sideOf(moment.team) };
        case 'decider':
            return null;
    }
}

/** The caption of a key moment, with a flash of light behind it. Never takes a tap. */
export function MomentBanner({ active, room, seat, watching }: MomentBannerProps) {
    const wording = active ? describe(active.moment, room, seat, watching) : null;
    const weight = active ? momentWeight(active.moment) : 'small';
    return (
        <AnimatePresence>
            {active && wording && (
                <motion.div
                    key={active.id}
                    className={`moment ${weight} ${wording.side}`}
                    initial={{ opacity: 0, scale: 0.6, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 1.08, transition: { duration: 0.25 } }}
                    transition={{ type: 'spring', stiffness: 420, damping: 20 }}
                >
                    <div className="moment-flash" />
                    <div className="moment-title">{wording.title}</div>
                    {wording.detail && <div className="moment-detail">{wording.detail}</div>}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
