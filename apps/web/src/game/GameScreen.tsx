import { cardId, legalCards, SUITS, type Card, type Seat, type Team } from '@cort/engine';
import { EMOTES, MEME_COUNT, STICKERS, memeId } from '@cort/protocol';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '../session/session';
import { isMuted, play, setMuted, unlockAudio } from '../sound';
import { SUIT_NAMES, SuitIcon, isRed } from './Card';
import { Hand } from './Hand';
import { Lobby } from './Lobby';
import { Ornament } from './Ornament';
import { PlayerPlate } from './PlayerPlate';
import { Meme, Reaction, Sticker, isLarge, stickerCaption } from './Sticker';
import { TrickArea, type CardOrigin } from './TrickArea';
import { positionOf, useLayout } from './layout';
import { useTable } from './useTable';

const OTHERS = [1, 2, 3] as const;

export function GameScreen({ session, onExit }: { session: Session; onExit: (message?: string) => void }) {
    const table = useTable(session);
    const layout = useLayout();
    const anchor = useRef<HTMLDivElement>(null);
    const [myOrigin, setMyOrigin] = useState<CardOrigin | null>(null);
    const [muted, setMutedState] = useState(isMuted);
    const [emotesOpen, setEmotesOpen] = useState(false);
    const [emoteTab, setEmoteTab] = useState<'memes' | 'stickers' | 'emoji'>('memes');
    const { room, view, seat } = table;
    const exit = () => onExit();

    // The table no longer exists (for example, the server was restarted): back to the menu, with the reason.
    useEffect(() => {
        if (table.closed) onExit(table.closed);
    }, [table.closed, onExit]);

    const playable = useMemo(() => {
        if (!view || view.phase !== 'playing' || view.turn !== seat) return null;
        return new Set(legalCards(view.hand, view.trick).map(cardId));
    }, [view, seat]);

    if (!room) {
        return (
            <div className="game">
                <Ornament />
                <div className="center-message">{table.error ?? 'Подключаемся…'}</div>
                <button type="button" className="icon-button corner-exit" onClick={exit} aria-label="Выйти">
                    ✕
                </button>
            </div>
        );
    }
    if (!room.started || !view) {
        return <Lobby room={room} seat={seat} error={table.error} onStart={() => session.start()} onExit={exit} />;
    }

    const myTeam = (seat % 2) as Team;
    const theirTeam = (1 - myTeam) as Team;
    const nameOf = (s: Seat) => room.seats[s].name;
    const myChoice = view.phase === 'choosingTrump' && view.caller === seat;

    const sendReaction = (value: string) => {
        session.emote(value);
        setEmotesOpen(false);
    };

    const playCard = (card: Card, element: HTMLElement) => {
        unlockAudio();
        const center = anchor.current?.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        if (center) {
            setMyOrigin({
                id: cardId(card),
                x: rect.left + rect.width / 2 - center.left,
                y: rect.top + rect.height / 2 - center.top,
                rotate: 0,
            });
        }
        session.playCard(card);
    };

    let status: string | null = null;
    if (view.phase === 'choosingTrump') {
        status = myChoice ? 'Выберите козырь' : `${nameOf(view.caller)} выбирает козырь`;
    } else if (view.phase === 'playing') {
        status = view.turn === seat ? 'Ваш ход' : `Ходит ${nameOf(view.turn)}`;
    }
    const myMove = myChoice || (view.phase === 'playing' && view.turn === seat);

    const won = (view.matchWinner ?? view.handWinner) === myTeam;
    const matchOver = view.phase === 'matchOver';

    return (
        <div className="game" style={{ ['--cw' as string]: `${layout.cardW}px` }}>
            <Ornament />

            <div className="hud hud-left">
                <div className="score">
                    <div className="score-head">
                        <span />
                        <span>взятки</span>
                        <span>счёт</span>
                    </div>
                    {([myTeam, theirTeam] as const).map((team) => (
                        <div key={team} className={`score-row ${team === myTeam ? 'mine' : ''}`}>
                            <span className="score-team">{team === myTeam ? 'Мы' : 'Они'}</span>
                            <span className="score-pips">
                                {Array.from({ length: 7 }, (_, i) => (
                                    <i key={i} className={i < view.tricksWon[team] ? 'on' : ''} />
                                ))}
                            </span>
                            <span className="score-match">{view.matchScore[team]}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="hud hud-right">
                {view.trump && (
                    <div className={`trump-chip ${isRed(view.trump) ? 'red' : 'black'}`} title={`Козырь: ${SUIT_NAMES[view.trump]}`}>
                        <span>козырь</span>
                        <SuitIcon suit={view.trump} />
                    </div>
                )}
                <button
                    type="button"
                    className="icon-button"
                    aria-label={muted ? 'Включить звук' : 'Выключить звук'}
                    onClick={() => {
                        setMuted(!muted);
                        setMutedState(!muted);
                        unlockAudio();
                    }}
                >
                    {muted ? '🔇' : '🔊'}
                </button>
                <button type="button" className="icon-button" aria-label="Выйти в меню" onClick={exit}>
                    ✕
                </button>
            </div>

            {OTHERS.map((offset) => {
                const s = ((seat + offset) % 4) as Seat;
                return (
                    <PlayerPlate
                        key={s}
                        info={room.seats[s]}
                        position={positionOf(s, seat)}
                        cards={view.handSizes[s]}
                        active={view.phase === 'choosingTrump' ? view.caller === s : view.phase === 'playing' && view.turn === s}
                        isCaller={view.caller === s}
                        trump={view.trump}
                        partner={offset === 2}
                        emote={table.emotes[s]}
                    />
                );
            })}

            <div className="table-center" ref={anchor}>
                <TrickArea plays={table.tablePlays} mySeat={seat} collectTo={table.collectTo} layout={layout} myOrigin={myOrigin} />
            </div>

            <AnimatePresence>
                {myChoice && (
                    <motion.div
                        key="picker"
                        className="trump-picker"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1, transition: { delay: 0.5 } }}
                        exit={{ opacity: 0, scale: 0.9 }}
                    >
                        <div className="trump-picker-title">Назовите козырь</div>
                        <div className="trump-picker-suits">
                            {SUITS.map((suit) => (
                                <button
                                    key={suit}
                                    type="button"
                                    className={`trump-option ${isRed(suit) ? 'red' : 'black'}`}
                                    onClick={() => {
                                        unlockAudio();
                                        play('tap');
                                        session.chooseTrump(suit);
                                    }}
                                >
                                    <SuitIcon suit={suit} />
                                    <span>{SUIT_NAMES[suit]}</span>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
                {table.trumpNotice && (
                    <motion.div
                        key="notice"
                        className={`trump-notice ${isRed(table.trumpNotice.suit) ? 'red' : 'black'}`}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.3 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                    >
                        <SuitIcon suit={table.trumpNotice.suit} />
                        <span>Козырь — {SUIT_NAMES[table.trumpNotice.suit].toLowerCase()}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="me">
                <AnimatePresence>
                    {table.emotes[seat] && (
                        <motion.div
                            key={table.emotes[seat]!.id}
                            className={`emote-bubble mine ${isLarge(table.emotes[seat]!.emote) ? 'sticker-bubble' : ''}`}
                            initial={{ scale: 0.3, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.6, opacity: 0 }}
                        >
                            <Reaction value={table.emotes[seat]!.emote} />
                        </motion.div>
                    )}
                </AnimatePresence>
                {status && (
                    <div className={`status ${myMove ? 'mine' : ''}`}>
                        {view.caller === seat && view.trump && <span className="status-crown">♛</span>}
                        {status}
                    </div>
                )}
            </div>

            <div className="emotes">
                {emotesOpen && (
                    <div className="emotes-panel">
                        <div className="emotes-tabs">
                            <button type="button" className={emoteTab === 'memes' ? 'on' : ''} onClick={() => setEmoteTab('memes')}>
                                Мемы
                            </button>
                            <button type="button" className={emoteTab === 'stickers' ? 'on' : ''} onClick={() => setEmoteTab('stickers')}>
                                Стикеры
                            </button>
                            <button type="button" className={emoteTab === 'emoji' ? 'on' : ''} onClick={() => setEmoteTab('emoji')}>
                                Эмодзи
                            </button>
                        </div>
                        {emoteTab === 'memes' ? (
                            <div className="emotes-grid memes">
                                {Array.from({ length: MEME_COUNT }, (_, index) => (
                                    <button key={index} type="button" aria-label={`Мем ${index + 1}`} onClick={() => sendReaction(memeId(index))}>
                                        <Meme index={index} />
                                    </button>
                                ))}
                            </div>
                        ) : emoteTab === 'stickers' ? (
                            <div className="emotes-grid stickers">
                                {STICKERS.map((id) => (
                                    <button key={id} type="button" aria-label={stickerCaption(id)} onClick={() => sendReaction(id)}>
                                        <Sticker id={id} />
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="emotes-grid">
                                {EMOTES.map((emote) => (
                                    <button key={emote} type="button" onClick={() => sendReaction(emote)}>
                                        {emote}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                <button type="button" className="emotes-toggle" aria-label="Эмоции" onClick={() => setEmotesOpen(!emotesOpen)}>
                    {emotesOpen ? '✕' : '😊'}
                </button>
            </div>

            <Hand cards={view.hand} handNumber={view.handNumber} playable={playable} layout={layout} onPlay={playCard} />

            <AnimatePresence>
                {table.resultVisible && (
                    <motion.div key="result" className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div
                            className={`result ${won ? 'won' : 'lost'}`}
                            initial={{ scale: 0.8, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                        >
                            <div className="result-title">
                                {matchOver ? (won ? 'Победа!' : 'Поражение') : won ? 'Раздача ваша' : 'Раздача за соперниками'}
                            </div>
                            <div className="result-line">
                                Взятки <b>{view.tricksWon[myTeam]}</b> : <b>{view.tricksWon[theirTeam]}</b>
                            </div>
                            <div className="result-score">
                                <span>Мы</span>
                                <b>{view.matchScore[myTeam]}</b>
                                <i>:</i>
                                <b>{view.matchScore[theirTeam]}</b>
                                <span>Они</span>
                            </div>
                            {matchOver ? (
                                <div className="result-actions">
                                    <button type="button" className="button primary" onClick={() => session.rematch()}>
                                        Ещё партию
                                    </button>
                                    <button type="button" className="button" onClick={exit}>
                                        В меню
                                    </button>
                                </div>
                            ) : (
                                <div className="result-next">
                                    Следующая раздача
                                    <div className="result-progress" />
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {(table.error || !table.online) && (
                    <motion.div key="toast" className="toast" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        {table.online ? table.error : 'Связь потеряна, переподключаемся…'}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
