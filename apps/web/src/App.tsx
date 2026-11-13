import { LocalSession, type Session } from '@cort/client';
import { MAX_NAME, MAX_TITLE, type Account, type MeResponse, type RoomSummary } from '@cort/protocol';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api';
import { Avatar } from './game/Avatar';
import { SuitIcon } from './game/Card';
import { GameScreen } from './game/GameScreen';
import { Ornament } from './game/Ornament';
import { GoogleButton } from './menu/GoogleButton';
import { OpenTables } from './menu/OpenTables';
import { Profile } from './menu/Profile';
import { RemoteSession } from './session/remote';
import { unlockAudio } from './sound';

const NAME_KEY = 'cort.name';
const AUTHOR_TELEGRAM = 'https://t.me/rasult22js';
/** The address the page was opened with. Read once: it describes how we arrived, not where we are now. */
const arrival = new URLSearchParams(location.search);
/** What a guest sees when there is no server to ask (the offline game still works). */
const NO_SERVER: MeResponse = { account: null, signIn: { googleClientId: null, dev: false } };

function storedName(): string {
    try {
        return localStorage.getItem(NAME_KEY) ?? '';
    } catch {
        return '';
    }
}

type Screen = 'menu' | 'newRoom' | 'profile';

export function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [screen, setScreen] = useState<Screen>('menu');
    /** Who we are and how one can sign in here; null until the server has answered. */
    const [me, setMe] = useState<MeResponse | null>(null);
    const [name, setName] = useState(storedName);
    /** The table we were invited to by link. Forgotten once we have been there. */
    const [invite, setInvite] = useState(() => arrival.get('room')?.toUpperCase() || null);
    const [code, setCode] = useState('');
    const [notice, setNotice] = useState<string | null>(null);
    const [draft, setDraft] = useState({ title: '', open: false });

    const [nameMissing, setNameMissing] = useState(false);
    const nameInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let cancelled = false;
        api.me()
            .then((answer) => !cancelled && setMe(answer))
            .catch(() => !cancelled && setMe(NO_SERVER));
        return () => {
            cancelled = true;
        };
    }, []);

    const account = me?.account ?? null;
    const setAccount = (next: Account | null) => setMe((current) => ({ ...(current ?? NO_SERVER), account: next }));
    const playerName = account?.name ?? name.trim();

    /** Every way into a game goes through here: no name, no game. */
    const requireName = (): boolean => {
        if (playerName) return true;
        setNameMissing(true);
        nameInput.current?.focus();
        return false;
    };
    const begin = (create: () => Session) => {
        if (!requireName()) return;
        unlockAudio();
        if (!account) {
            try {
                localStorage.setItem(NAME_KEY, name.trim());
            } catch {
                // The name just will not be remembered.
            }
        }
        setNotice(null);
        setScreen('menu');
        setSession(create());
    };
    const join = (tableCode: string, watch = false) => begin(() => new RemoteSession({ name: playerName, code: tableCode, watch }));

    const signedIn = (signed: Promise<{ account: Account }>) =>
        signed
            .then(({ account: next }) => {
                setAccount(next);
                setNotice(null);
            })
            .catch((error) => setNotice(error instanceof ApiError ? error.message : 'Не удалось войти. Попробуйте ещё раз.'));

    if (session) {
        return (
            <GameScreen
                session={session}
                onExit={(message) => {
                    session.dispose();
                    history.replaceState(null, '', location.pathname);
                    setSession(null);
                    // Whatever table we were at, the invitation has served its purpose.
                    setInvite(null);
                    setNotice(message ?? null);
                }}
            />
        );
    }

    const brand = (
        <div className="brand">
            <div className="brand-suits">
                <SuitIcon suit="spades" />
                <SuitIcon suit="hearts" className="red" />
                <SuitIcon suit="clubs" />
                <SuitIcon suit="diamonds" className="red" />
            </div>
            <h1 className="brand-title">Корт</h1>
            <p className="brand-sub">уйгурская карточная игра</p>
        </div>
    );

    if (screen === 'profile' && account) {
        return (
            <div className="game menu">
                <Ornament />
                <Profile
                    account={account}
                    onAccount={(next) => {
                        setAccount(next);
                        if (!next) setScreen('menu');
                    }}
                    onBack={() => setScreen('menu')}
                />
            </div>
        );
    }

    if (screen === 'newRoom') {
        const open = draft.open && account !== null;
        return (
            <div className="game menu">
                <Ornament />
                <form
                    className="panel menu-panel"
                    onSubmit={(event) => {
                        event.preventDefault();
                        begin(() => new RemoteSession({ name: playerName, title: draft.title.trim(), open }));
                    }}
                >
                    {brand}
                    <label className="field">
                        <span>Название комнаты</span>
                        <input
                            value={draft.title}
                            maxLength={MAX_TITLE}
                            placeholder={`Комната ${playerName}`}
                            autoFocus
                            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                        />
                    </label>
                    <label className={`toggle ${account ? '' : 'locked'}`}>
                        <input type="checkbox" checked={open} disabled={!account} onChange={(event) => setDraft({ ...draft, open: event.target.checked })} />
                        <span>
                            Открытая комната
                            <small>
                                {!account
                                    ? 'Гости играют по ссылке. Открытые комнаты — после входа'
                                    : open
                                      ? 'Видна в списке: сесть или посмотреть может любой'
                                      : 'Только по ссылке или коду'}
                            </small>
                        </span>
                    </label>
                    <button type="submit" className="button primary wide">
                        Создать комнату
                    </button>
                    <button type="button" className="button ghost wide" onClick={() => setScreen('menu')}>
                        Назад
                    </button>
                </form>
            </div>
        );
    }

    const seed = arrival.get('seed');
    const playWithBots = () =>
        begin(() => new LocalSession({ name: playerName, seed: seed ? Number(seed) : undefined, demo: arrival.has('demo') }));
    const canSignIn = me !== null && (me.signIn.googleClientId !== null || me.signIn.dev);

    return (
        <div className="game menu">
            <Ornament />
            <div className="panel menu-panel">
                {brand}

                {notice && <div className="menu-notice">{notice}</div>}

                {account ? (
                    <button type="button" className="profile-row" onClick={() => setScreen('profile')}>
                        <Avatar name={account.name} avatar={account.avatar} />
                        <span>
                            <b>{account.name}</b>
                            <small>Профиль, история и статистика</small>
                        </span>
                        <i aria-hidden="true">›</i>
                    </button>
                ) : (
                    <div className="who">
                        <label className={`field ${nameMissing ? 'invalid' : ''}`}>
                            <span>Ваше имя</span>
                            <input
                                ref={nameInput}
                                value={name}
                                maxLength={MAX_NAME}
                                placeholder="Как вас зовут?"
                                required
                                aria-invalid={nameMissing}
                                onChange={(event) => {
                                    setName(event.target.value);
                                    if (event.target.value.trim()) setNameMissing(false);
                                }}
                            />
                            {nameMissing && <em>Введите имя, чтобы начать игру</em>}
                        </label>
                    </div>
                )}

                {invite && <Invite code={invite} signedIn={account !== null} onPlay={() => join(invite)} onWatch={() => join(invite, true)} />}

                <button type="button" className={`button wide ${invite ? '' : 'primary'}`} onClick={playWithBots}>
                    Играть с ботами
                </button>

                <button type="button" className="button wide" onClick={() => requireName() && setScreen('newRoom')}>
                    Создать комнату
                </button>

                {!account && canSignIn && (
                    <div className="signin">
                        <div className="signin-or">
                            <span>вы играете как гость</span>
                        </div>
                        {me.signIn.googleClientId && (
                            <GoogleButton clientId={me.signIn.googleClientId} onCredential={(credential) => void signedIn(api.signInWithGoogle(credential))} />
                        )}
                        {me.signIn.dev && (
                            <button type="button" className="button wide" onClick={() => requireName() && void signedIn(api.signInForDevelopment(playerName))}>
                                Войти без Google (разработка)
                            </button>
                        )}
                        <p className="signin-hint">С аккаунтом: история партий и статистика, свой аватар, открытые комнаты и просмотр чужих игр.</p>
                    </div>
                )}

                <OpenTables signedIn={account !== null} onJoin={join} />

                <form
                    className="menu-join"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (code.trim()) join(code.trim());
                    }}
                >
                    <input
                        value={code}
                        maxLength={5}
                        placeholder="Код комнаты"
                        aria-label="Код комнаты"
                        onChange={(event) => setCode(event.target.value.toUpperCase())}
                    />
                    <button type="submit" className="button" disabled={!code.trim()}>
                        Войти
                    </button>
                </form>
                <p className="menu-note">Двое на двое · 13 карт · первая команда с 7 взятками берёт раздачу</p>
                <p className="menu-contact">
                    Идеи и предложения — автору в Telegram:{' '}
                    <a href={AUTHOR_TELEGRAM} target="_blank" rel="noopener noreferrer">
                        @rasult22js
                    </a>
                </p>
            </div>
        </div>
    );
}

interface InviteProps {
    code: string;
    signedIn: boolean;
    onPlay: () => void;
    onWatch: () => void;
}

/** The table we were sent a link to: what is going on there, and the ways in. */
function Invite({ code, signedIn, onPlay, onWatch }: InviteProps) {
    /** undefined while asking; null if the server could not tell us (then we just offer to go in). */
    const [table, setTable] = useState<RoomSummary | null | 'gone' | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        api.room(code)
            .then((found) => !cancelled && setTable(found))
            .catch((error) => !cancelled && setTable(error instanceof ApiError && error.status === 404 ? 'gone' : null));
        return () => {
            cancelled = true;
        };
    }, [code]);

    if (table === 'gone') {
        return (
            <div className="invite">
                <div className="invite-title">Комната {code} уже закрыта</div>
                <div className="invite-note">Попросите друзей прислать свежую ссылку или создайте свою комнату.</div>
            </div>
        );
    }

    const free = table ? 4 - table.players : 1;
    return (
        <div className="invite">
            <div className="invite-kicker">вас позвали за стол</div>
            <div className="invite-title">{table?.title || `Комната ${code}`}</div>
            {table && (
                <div className="invite-note">
                    {table.started ? 'идёт игра' : 'собирается'} · {table.players} из 4
                    {table.started && free > 0 && ' · можно сесть вместо бота'}
                    {table.spectators > 0 && ` · зрителей: ${table.spectators}`}
                </div>
            )}
            <div className="invite-actions">
                <button type="button" className="button primary" disabled={free <= 0} onClick={onPlay}>
                    {free > 0 ? `Войти в комнату ${code}` : 'Мест нет'}
                </button>
                {signedIn && (
                    <button type="button" className="button" onClick={onWatch}>
                        Смотреть
                    </button>
                )}
            </div>
            {!signedIn && free <= 0 && <div className="invite-note">Войдите в аккаунт, чтобы посмотреть игру.</div>}
        </div>
    );
}
