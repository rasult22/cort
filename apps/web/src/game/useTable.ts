import { TableStore, type Session, type TableEffects, type TableState } from '@cort/client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { haptic, play, playDeal, playMoment } from '../sound';

export type { ActiveMoment, Emote, TableState } from '@cort/client';

const effects: TableEffects = { play, deal: playDeal, haptic, moment: playMoment };

/** What should be on screen right now, for this session. See TableStore. */
export function useTable(session: Session): TableState {
    const store = useMemo(() => new TableStore(session, effects), [session]);
    useEffect(() => {
        store.connect();
        return () => store.disconnect();
    }, [store]);
    return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
