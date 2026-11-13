import { TableStore, type Session, type TableState } from '@cort/client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { effects } from '../sound';

/** What should be on screen right now, for this session. The model is shared with the web: see TableStore. */
export function useTable(session: Session): TableState {
    const store = useMemo(() => new TableStore(session, effects), [session]);
    useEffect(() => {
        store.connect();
        return () => store.disconnect();
    }, [store]);
    return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
