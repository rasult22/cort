import type { Suit } from '@cort/engine';
import { MAX_NAME, type Account, type HistoryResponse, type MatchSummary } from '@cort/protocol';
import { useEffect, useState } from 'react';
import { ApiError, api } from '../api';
import { ALL_PRESETS, Avatar } from '../game/Avatar';
import { SuitIcon, isRed } from '../game/Card';

interface ProfileProps {
    account: Account;
    /** The account changed; null means the person signed out or deleted it. */
    onAccount: (account: Account | null) => void;
    onBack: () => void;
}

const when = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const percent = (part: number, whole: number): string => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
const minutes = (seconds: number): string => `${Math.max(1, Math.round(seconds / 60))} мин`;
const isSuit = (value: string | null): value is Suit => value === 'spades' || value === 'hearts' || value === 'clubs' || value === 'diamonds';

/** The signed-in player's own page: who they are at the table, and how their games have gone. */
export function Profile({ account, onAccount, onBack }: ProfileProps) {
    const [name, setName] = useState(account.name);
    const [history, setHistory] = useState<HistoryResponse | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const [opened, setOpened] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        let cancelled = false;
        api.history()
            .then((answer) => !cancelled && setHistory(answer))
            .catch(() => !cancelled && setProblem('Не удалось загрузить историю.'));
        return () => {
            cancelled = true;
        };
    }, []);

    const fail = (error: unknown) => setProblem(error instanceof ApiError ? error.message : 'Не получилось. Попробуйте ещё раз.');
    const save = (changes: { name?: string; avatar?: string }) =>
        api
            .saveProfile(changes)
            .then(({ account: next }) => {
                setProblem(null);
                onAccount(next);
            })
            .catch(fail);

    // What is stored is a choice ('photo', 'none' or a preset); what we get back is what others see.
    const choice = account.avatar === null ? 'none' : account.avatar === account.photo ? 'photo' : account.avatar;
    const choices = [...(account.photo ? ['photo'] : []), 'none', ...ALL_PRESETS];
    const stats = history?.stats;

    return (
        <div className="panel profile">
            <div className="screen-head">
                <button type="button" className="icon-button" aria-label="Назад" onClick={onBack}>
                    ‹
                </button>
                <h2>Профиль</h2>
            </div>

            <form
                className="profile-me"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (name.trim() && name.trim() !== account.name) void save({ name });
                }}
            >
                <Avatar name={account.name} avatar={account.avatar} />
                <label className="field">
                    <span>Имя за столом</span>
                    <input value={name} maxLength={MAX_NAME} onChange={(event) => setName(event.target.value)} />
                </label>
                {name.trim() !== account.name && name.trim() !== '' && (
                    <button type="submit" className="button primary">
                        Сохранить
                    </button>
                )}
            </form>

            <div className="section-title">Аватар</div>
            <div className="avatar-picker">
                {choices.map((option) => (
                    <button
                        key={option}
                        type="button"
                        className={`avatar-choice ${choice === option ? 'on' : ''}`}
                        aria-label={option === 'photo' ? 'Фото из Google' : option === 'none' ? 'Первая буква имени' : 'Картинка'}
                        aria-pressed={choice === option}
                        onClick={() => choice !== option && void save({ avatar: option })}
                    >
                        <Avatar name={account.name} avatar={option === 'photo' ? account.photo : option === 'none' ? null : option} />
                    </button>
                ))}
            </div>

            {problem && <div className="form-error">{problem}</div>}

            <div className="section-title">Статистика</div>
            {!stats ? (
                <div className="profile-empty">{problem ? '—' : 'Загружаем…'}</div>
            ) : stats.matches === 0 ? (
                <div className="profile-empty">Сыграйте партию до конца за онлайн-столом — она появится здесь. Игры с ботами на этом устройстве не считаются.</div>
            ) : (
                <div className="stats">
                    <Stat value={stats.matches} label="партий" />
                    <Stat value={stats.wins} label={`побед · ${percent(stats.wins, stats.matches)}`} />
                    <Stat value={stats.handsWon} label={`раздач взято · ${percent(stats.handsWon, stats.hands)}`} />
                    <Stat value={stats.dryWins} label="сухих побед" />
                    <Stat value={stats.calls} label="раз заказывали козырь" />
                </div>
            )}

            {history && history.rivals.length > 0 && (
                <>
                    <div className="section-title">С кем играли</div>
                    <div className="rivals">
                        {history.rivals.map((rival, index) => (
                            <div key={index} className="rival">
                                <Avatar name={rival.name} avatar={rival.avatar} />
                                <b>{rival.name}</b>
                                <span className="rival-record">
                                    {rival.together.matches > 0 && (
                                        <span className="ours">
                                            вместе {rival.together.wins}:{rival.together.matches - rival.together.wins}
                                        </span>
                                    )}
                                    {rival.against.matches > 0 && (
                                        <span className="theirs">
                                            против {rival.against.wins}:{rival.against.matches - rival.against.wins}
                                        </span>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {history && history.matches.length > 0 && (
                <>
                    <div className="section-title">Последние партии</div>
                    <div className="matches">
                        {history.matches.map((match) => (
                            <Match key={match.id} match={match} open={opened === match.id} onToggle={() => setOpened(opened === match.id ? null : match.id)} />
                        ))}
                    </div>
                </>
            )}

            <div className="profile-actions">
                <button
                    type="button"
                    className="button wide"
                    onClick={() =>
                        void api
                            .signOut()
                            .then(() => onAccount(null))
                            .catch(fail)
                    }
                >
                    Выйти из аккаунта
                </button>
                {confirmDelete ? (
                    <div className="danger-box">
                        <p>Аккаунт и ваша история будут удалены без возможности вернуть. У других игроков партии с вами останутся, но без вашего имени.</p>
                        <div className="result-actions">
                            <button
                                type="button"
                                className="button danger"
                                onClick={() =>
                                    void api
                                        .deleteAccount()
                                        .then(() => onAccount(null))
                                        .catch(fail)
                                }
                            >
                                Удалить навсегда
                            </button>
                            <button type="button" className="button" onClick={() => setConfirmDelete(false)}>
                                Отмена
                            </button>
                        </div>
                    </div>
                ) : (
                    <button type="button" className="button ghost wide" onClick={() => setConfirmDelete(true)}>
                        Удалить аккаунт
                    </button>
                )}
                {account.email && <p className="profile-email">Вы вошли как {account.email}. Почту видите только вы.</p>}
            </div>
        </div>
    );
}

function Stat({ value, label }: { value: number; label: string }) {
    return (
        <div className="stat">
            <b>{value}</b>
            <span>{label}</span>
        </div>
    );
}

/** One played match: the result at a glance, and hand by hand when opened. */
function Match({ match, open, onToggle }: { match: MatchSummary; open: boolean; onToggle: () => void }) {
    const myTeam = match.mySeat % 2;
    const partner = match.players.find((player) => !player.me && player.seat % 2 === myTeam);
    const rivals = match.players.filter((player) => player.seat % 2 !== myTeam);
    const nameOf = (seat: number) => match.players.find((player) => player.seat === seat)?.name ?? '';

    return (
        <div className={`match ${match.won ? 'won' : 'lost'}`}>
            <button type="button" className="match-head" aria-expanded={open} onClick={onToggle}>
                <span className="match-score">
                    {match.score[myTeam]}:{match.score[1 - myTeam]}
                </span>
                <span className="match-who">
                    <b>{match.won ? 'Победа' : 'Поражение'}</b>
                    <small>
                        с {partner?.name ?? '—'} против {rivals.map((player) => player.name).join(' и ')}
                    </small>
                </span>
                <span className="match-when">
                    {when.format(new Date(match.endedAt))}
                    <small>{minutes(match.duration)}</small>
                </span>
            </button>
            {open && (
                <ol className="match-hands">
                    {match.hands.map((hand, index) => (
                        <li key={index} className={hand.winner === myTeam ? 'ours' : 'theirs'}>
                            <span className={`match-trump ${isSuit(hand.trump) && isRed(hand.trump) ? 'red' : ''}`}>{isSuit(hand.trump) && <SuitIcon suit={hand.trump} />}</span>
                            <span className="match-caller">заказывал(а) {nameOf(hand.caller)}</span>
                            <b>
                                {hand.tricks[myTeam]}:{hand.tricks[1 - myTeam]}
                            </b>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}
