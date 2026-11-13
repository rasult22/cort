import type { RoomSummary } from '@cort/protocol';
import { useEffect, useState } from 'react';
import { api } from '../api';

const REFRESH_MS = 4000;

interface OpenTablesProps {
    signedIn: boolean;
    onJoin: (code: string, watch?: boolean) => void;
}

/** The public list of tables, refreshed while it is on screen. */
export function OpenTables({ signedIn, onJoin }: OpenTablesProps) {
    /** null until the first answer; stays null if there is no server to ask. */
    const [tables, setTables] = useState<RoomSummary[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const list = await api.rooms();
                if (!cancelled) setTables(list);
            } catch {
                // Offline or no server: the list simply is not shown.
                if (!cancelled) setTables(null);
            }
        };
        void load();
        const timer = setInterval(load, REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, []);

    if (!tables) return null;

    return (
        <div className="tables">
            <div className="tables-head">
                <span>Открытые комнаты</span>
                <span>{tables.length || ''}</span>
            </div>
            {tables.length === 0 ? (
                <div className="tables-empty">
                    {signedIn ? 'Пока никто не ждёт. Создайте открытую комнату — к вам присоединятся.' : 'Пока никто не ждёт. Позовите друзей по ссылке — создайте комнату.'}
                </div>
            ) : (
                <div className="tables-list">
                    {tables.map((table) => {
                        const free = table.players < 4;
                        const note = !table.started
                            ? `ждёт игроков · ${table.host}`
                            : free
                              ? 'идёт игра · можно сесть вместо бота'
                              : signedIn
                                ? 'идёт игра · мест нет'
                                : 'идёт игра · смотреть можно после входа';
                        return (
                            <div key={table.code} className="table-row">
                                <button type="button" className="table-row-main" disabled={!free && !signedIn} onClick={() => onJoin(table.code, !free)}>
                                    <span>
                                        <span className="table-row-title">{table.title}</span>
                                        <span className="table-row-note">
                                            {note}
                                            {table.spectators > 0 && ` · 👁 ${table.spectators}`}
                                        </span>
                                    </span>
                                    <span className="table-row-seats" aria-label={`${table.players} из 4`}>
                                        {Array.from({ length: 4 }, (_, i) => (
                                            <i key={i} className={i < table.players ? 'taken' : ''} />
                                        ))}
                                    </span>
                                </button>
                                {signedIn && table.started && (
                                    <button type="button" className="table-row-watch" aria-label={`Смотреть: ${table.title}`} onClick={() => onJoin(table.code, true)}>
                                        Смотреть
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
