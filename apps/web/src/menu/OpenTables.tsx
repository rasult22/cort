import type { RoomSummary } from '@cort/protocol';
import { useEffect, useState } from 'react';

const REFRESH_MS = 4000;

/** The public list of tables, refreshed while it is on screen. */
export function OpenTables({ onJoin }: { onJoin: (code: string) => void }) {
    /** null until the first answer; stays null if there is no server to ask. */
    const [tables, setTables] = useState<RoomSummary[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const response = await fetch('/rooms', { cache: 'no-store' });
                if (!response.ok) throw new Error(String(response.status));
                const list = (await response.json()) as RoomSummary[];
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
                <div className="tables-empty">Пока никто не ждёт. Создайте открытую комнату — к вам присоединятся.</div>
            ) : (
                <div className="tables-list">
                    {tables.map((table) => (
                        <button key={table.code} type="button" className="table-row" onClick={() => onJoin(table.code)}>
                            <span>
                                <div className="table-row-title">{table.title}</div>
                                <div className="table-row-note">
                                    {table.started ? 'идёт игра · можно сесть вместо бота' : `ждёт игроков · ${table.host}`}
                                </div>
                            </span>
                            <span className="table-row-seats" aria-label={`${table.players} из 4`}>
                                {Array.from({ length: 4 }, (_, i) => (
                                    <i key={i} className={i < table.players ? 'taken' : ''} />
                                ))}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
