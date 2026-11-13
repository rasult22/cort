import type { Seat } from '@cort/engine';
import type { RoomInfo } from '@cort/protocol';
import { useState } from 'react';
import { unlockAudio } from '../sound';
import { Avatar } from './Avatar';
import { Ornament } from './Ornament';

interface LobbyProps {
    room: RoomInfo;
    seat: Seat;
    /** We came to watch and have no seat yet. */
    watching: boolean;
    error: string | null;
    onStart: () => void;
    onSit: (seat: Seat) => void;
    onExit: () => void;
}

/** Where each seat is drawn. Fixed, so the picture does not spin when someone moves: partners face each other. */
const SPOTS = ['bottom', 'left', 'top', 'right'] as const;

/** The waiting room of an online table: who sits where, and the link to invite others. */
export function Lobby({ room, seat, watching, error, onStart, onSit, onExit }: LobbyProps) {
    const [copied, setCopied] = useState(false);
    const link = `${location.origin}${location.pathname}?room=${room.code}`;
    const isHost = !watching && room.host === seat;
    const humans = room.seats.filter((s) => s.kind === 'human').length;
    const myTeam = seat % 2;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            // Clipboard is unavailable (e.g. plain http): the link is on screen to copy by hand.
        }
    };

    return (
        <div className="game">
            <Ornament />
            <div className="panel lobby">
                <div className="lobby-title">{room.title}</div>
                <div className="panel-kicker">{room.open ? 'открытая комната · код' : 'только по ссылке · код'}</div>
                <div className="lobby-code">{room.code}</div>

                <div className="lobby-link">
                    <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} aria-label="Ссылка на комнату" />
                    <button type="button" className="button" onClick={copy}>
                        {copied ? 'Скопировано' : 'Копировать'}
                    </button>
                </div>

                <div className="seat-map">
                    <div className="seat-map-table">
                        <span>напарники сидят напротив</span>
                    </div>
                    {room.seats.map((info) => {
                        const mine = !watching && info.seat === seat;
                        const team = watching ? `team${info.seat % 2}` : info.seat % 2 === myTeam ? 'ours' : 'theirs';
                        const note =
                            info.kind === 'empty'
                                ? 'сесть сюда'
                                : !info.connected
                                  ? 'отошёл'
                                  : mine
                                    ? 'это вы'
                                    : watching
                                      ? info.seat === room.host
                                          ? 'хозяин'
                                          : 'игрок'
                                      : info.seat % 2 === myTeam
                                        ? 'напарник'
                                        : 'соперник';
                        const content = (
                            <>
                                <Avatar name={info.name} avatar={info.avatar} empty={info.kind === 'empty'} />
                                <span className="seat-spot-name">{info.kind === 'empty' ? 'Свободно' : info.name}</span>
                                <span className="seat-spot-note">{note}</span>
                            </>
                        );
                        const className = `seat-spot pos-${SPOTS[info.seat]} ${info.kind} ${team} ${mine ? 'mine' : ''}`;
                        return info.kind === 'empty' ? (
                            <button key={info.seat} type="button" className={className} aria-label={`Сесть на место ${info.seat + 1}`} onClick={() => onSit(info.seat)}>
                                {content}
                            </button>
                        ) : (
                            <div key={info.seat} className={className}>
                                {content}
                            </div>
                        );
                    })}
                </div>
                <p className="lobby-hint">
                    {watching ? 'Вы смотрите. Нажмите на свободное место, чтобы сесть за стол.' : 'Нажмите на свободное место, чтобы пересесть. Пустые места займут боты.'}
                </p>

                {room.spectators.length > 0 && (
                    <div className="lobby-watchers">
                        <span>Смотрят</span>
                        {room.spectators.map((spectator) => (
                            <span key={spectator.id} className="lobby-watcher">
                                <Avatar name={spectator.name} avatar={spectator.avatar} />
                                {spectator.name}
                            </span>
                        ))}
                    </div>
                )}

                {error && <div className="form-error">{error}</div>}

                {isHost ? (
                    <button
                        type="button"
                        className="button primary wide"
                        onClick={() => {
                            unlockAudio();
                            onStart();
                        }}
                    >
                        {humans < 4 ? `Начать — ${4 - humans} ${botsWord(4 - humans)}` : 'Начать игру'}
                    </button>
                ) : (
                    <div className="lobby-wait">Ждём, когда {room.seats[room.host].name || 'хозяин'} начнёт игру…</div>
                )}
                <button type="button" className="button ghost wide" onClick={onExit}>
                    Выйти
                </button>
            </div>
        </div>
    );
}

const botsWord = (n: number) => (n === 1 ? 'место займёт бот' : 'места займут боты');
