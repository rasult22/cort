import { useState } from 'react';
import { GameScreen } from './game/GameScreen';
import { Ornament } from './game/Ornament';
import { SuitIcon } from './game/Card';
import { LocalSession } from './session/local';
import { RemoteSession } from './session/remote';
import type { Session } from './session/session';
import { unlockAudio } from './sound';

const NAME_KEY = 'cort.name';
/** The address the page was opened with. Read once: it describes how we arrived, not where we are now. */
const arrival = new URLSearchParams(location.search);

function storedName(): string {
    try {
        return localStorage.getItem(NAME_KEY) ?? '';
    } catch {
        return '';
    }
}

export function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [name, setName] = useState(storedName);
    /** The table we were invited to by link. Forgotten once we have been there. */
    const [invite, setInvite] = useState(() => arrival.get('room')?.toUpperCase() || null);
    const [code, setCode] = useState('');
    const [notice, setNotice] = useState<string | null>(null);

    const playerName = name.trim() || 'Игрок';
    const begin = (create: () => Session) => {
        unlockAudio();
        try {
            localStorage.setItem(NAME_KEY, name.trim());
        } catch {
            // The name just will not be remembered.
        }
        setNotice(null);
        setSession(create());
    };

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

    const seed = arrival.get('seed');
    const playWithBots = () =>
        begin(() => new LocalSession({ name: playerName, seed: seed ? Number(seed) : undefined, demo: arrival.has('demo') }));

    return (
        <div className="game menu">
            <Ornament />
            <div className="panel menu-panel">
                <div className="menu-suits">
                    <SuitIcon suit="spades" />
                    <SuitIcon suit="hearts" className="red" />
                    <SuitIcon suit="clubs" />
                    <SuitIcon suit="diamonds" className="red" />
                </div>
                <h1 className="menu-title">Корт</h1>
                <p className="menu-subtitle">уйгурская карточная игра</p>

                {notice && <div className="menu-notice">{notice}</div>}

                <label className="field">
                    <span>Ваше имя</span>
                    <input value={name} maxLength={16} placeholder="Игрок" onChange={(event) => setName(event.target.value)} />
                </label>

                {invite && (
                    <button
                        type="button"
                        className="button primary wide"
                        onClick={() => begin(() => new RemoteSession({ name: playerName, code: invite }))}
                    >
                        Сесть за стол {invite}
                    </button>
                )}

                <button type="button" className={`button wide ${invite ? '' : 'primary'}`} onClick={playWithBots}>
                    Играть с ботами
                </button>

                <button type="button" className="button wide" onClick={() => begin(() => new RemoteSession({ name: playerName }))}>
                    Создать стол для друзей
                </button>

                <form
                    className="menu-join"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (code.trim()) begin(() => new RemoteSession({ name: playerName, code: code.trim() }));
                    }}
                >
                    <input
                        value={code}
                        maxLength={5}
                        placeholder="Код стола"
                        aria-label="Код стола"
                        onChange={(event) => setCode(event.target.value.toUpperCase())}
                    />
                    <button type="submit" className="button" disabled={!code.trim()}>
                        Войти
                    </button>
                </form>
                <p className="menu-note">Двое на двое · 13 карт · первая команда с 7 взятками берёт раздачу</p>
            </div>
        </div>
    );
}
