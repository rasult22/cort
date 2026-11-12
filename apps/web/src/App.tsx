import { MAX_TITLE } from '@cort/protocol';
import { useRef, useState } from 'react';
import { GameScreen } from './game/GameScreen';
import { Ornament } from './game/Ornament';
import { SuitIcon } from './game/Card';
import { OpenTables } from './menu/OpenTables';
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
    /** The "new table" form: null while closed. */
    const [draft, setDraft] = useState<{ title: string; open: boolean } | null>(null);

    const [nameMissing, setNameMissing] = useState(false);
    const nameInput = useRef<HTMLInputElement>(null);

    const playerName = name.trim();
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
        try {
            localStorage.setItem(NAME_KEY, name.trim());
        } catch {
            // The name just will not be remembered.
        }
        setNotice(null);
        setDraft(null);
        setSession(create());
    };
    const join = (tableCode: string) => begin(() => new RemoteSession({ name: playerName, code: tableCode }));

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

    const header = (
        <>
            <div className="menu-suits">
                <SuitIcon suit="spades" />
                <SuitIcon suit="hearts" className="red" />
                <SuitIcon suit="clubs" />
                <SuitIcon suit="diamonds" className="red" />
            </div>
            <h1 className="menu-title">Корт</h1>
            <p className="menu-subtitle">уйгурская карточная игра</p>
        </>
    );

    if (draft) {
        return (
            <div className="game menu">
                <Ornament />
                <form
                    className="panel menu-panel"
                    onSubmit={(event) => {
                        event.preventDefault();
                        begin(() => new RemoteSession({ name: playerName, title: draft.title.trim(), open: draft.open }));
                    }}
                >
                    {header}
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
                    <label className="toggle">
                        <input type="checkbox" checked={draft.open} onChange={(event) => setDraft({ ...draft, open: event.target.checked })} />
                        <span>
                            Открытая комната
                            <small>{draft.open ? 'Видна в списке, войти может любой' : 'Только по ссылке или коду'}</small>
                        </span>
                    </label>
                    <button type="submit" className="button primary wide">
                        Создать комнату
                    </button>
                    <button type="button" className="button ghost wide" onClick={() => setDraft(null)}>
                        Назад
                    </button>
                </form>
            </div>
        );
    }

    const seed = arrival.get('seed');
    const playWithBots = () =>
        begin(() => new LocalSession({ name: playerName, seed: seed ? Number(seed) : undefined, demo: arrival.has('demo') }));

    return (
        <div className="game menu">
            <Ornament />
            <div className="panel menu-panel">
                {header}

                {notice && <div className="menu-notice">{notice}</div>}

                <label className={`field ${nameMissing ? 'invalid' : ''}`}>
                    <span>Ваше имя</span>
                    <input
                        ref={nameInput}
                        value={name}
                        maxLength={16}
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

                {invite && (
                    <button type="button" className="button primary wide" onClick={() => join(invite)}>
                        Войти в комнату {invite}
                    </button>
                )}

                <button type="button" className={`button wide ${invite ? '' : 'primary'}`} onClick={playWithBots}>
                    Играть с ботами
                </button>

                <button type="button" className="button wide" onClick={() => requireName() && setDraft({ title: '', open: true })}>
                    Создать комнату
                </button>

                <OpenTables onJoin={join} />

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
            </div>
        </div>
    );
}
