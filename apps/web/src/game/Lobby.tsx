import type { Seat } from '@cort/engine';
import type { RoomInfo } from '@cort/protocol';
import { useState } from 'react';
import { unlockAudio } from '../sound';
import { Ornament } from './Ornament';

interface LobbyProps {
    room: RoomInfo;
    seat: Seat;
    error: string | null;
    onStart: () => void;
    onExit: () => void;
}

/** The waiting room of an online table: who has sat down, and the link to invite others. */
export function Lobby({ room, seat, error, onStart, onExit }: LobbyProps) {
    const [copied, setCopied] = useState(false);
    const link = `${location.origin}${location.pathname}?room=${room.code}`;
    const isHost = room.host === seat;
    const humans = room.seats.filter((s) => s.kind === 'human').length;

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
                <div className="panel-kicker">{room.open ? 'открытый стол · код' : 'только по ссылке · код'}</div>
                <div className="lobby-code">{room.code}</div>

                <div className="lobby-link">
                    <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} aria-label="Ссылка на стол" />
                    <button type="button" className="button" onClick={copy}>
                        {copied ? 'Скопировано' : 'Копировать'}
                    </button>
                </div>
                <p className="lobby-hint">Отправьте ссылку друзьям. Напарники сидят друг напротив друга.</p>

                <div className="lobby-seats">
                    {room.seats.map((info) => (
                        <div key={info.seat} className={`lobby-seat ${info.kind} team${info.seat % 2}`}>
                            <div className="plate-avatar">
                                <span>{info.kind === 'empty' ? '?' : info.name.slice(0, 1).toUpperCase()}</span>
                            </div>
                            <div>
                                <div className="lobby-seat-name">
                                    {info.kind === 'empty' ? 'Свободно' : info.name}
                                    {info.seat === seat && ' (вы)'}
                                </div>
                                <div className="lobby-seat-note">
                                    {info.kind === 'empty'
                                        ? 'сядет бот'
                                        : !info.connected
                                          ? 'отошёл'
                                          : info.seat % 2 === seat % 2
                                          ? 'ваша команда'
                                          : 'соперники'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

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
                    <div className="lobby-wait">Ждём, когда {room.seats[room.host].name} начнёт игру…</div>
                )}
                <button type="button" className="button ghost wide" onClick={onExit}>
                    Выйти
                </button>
            </div>
        </div>
    );
}

const botsWord = (n: number) => (n === 1 ? 'место займёт бот' : 'места займут боты');
