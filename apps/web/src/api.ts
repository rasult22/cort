import type { Account, HistoryResponse, MeResponse, RoomSummary } from '@cort/protocol';

const DEVICE_KEY = 'cort.device';

/**
 * A random id for this browser. A guest's games are filed under it, so they
 * can be moved to an account if the person signs in later. It is never shown
 * to other players.
 */
export function deviceId(): string | undefined {
    try {
        let id = localStorage.getItem(DEVICE_KEY);
        if (!id) {
            // getRandomValues, not randomUUID: it also works on a plain-http address in the local network.
            id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
            localStorage.setItem(DEVICE_KEY, id);
        }
        return id;
    } catch {
        return undefined;
    }
}

/** A request the server turned down; `message` is written for the player. */
export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
    ) {
        super(message);
    }
}

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(path, {
        method,
        cache: 'no-store',
        credentials: 'same-origin',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok || data === null) throw new ApiError(data?.error ?? 'Сервер не отвечает', response.status);
    return data;
}

interface Signed {
    account: Account;
}

export const api = {
    me: () => call<MeResponse>('/api/me'),
    signInWithGoogle: (credential: string) => call<Signed>('/api/auth/google', 'POST', { credential, device: deviceId() }),
    signInForDevelopment: (name: string) => call<Signed>('/api/auth/dev', 'POST', { name, device: deviceId() }),
    signOut: () => call<{ ok: true }>('/api/auth/logout', 'POST', {}),
    saveProfile: (changes: { name?: string; avatar?: string }) => call<Signed>('/api/profile', 'POST', changes),
    deleteAccount: () => call<{ ok: true }>('/api/account', 'DELETE'),
    history: () => call<HistoryResponse>('/api/history'),
    rooms: () => call<RoomSummary[]>('/api/rooms'),
    room: (code: string) => call<RoomSummary>(`/api/rooms/${encodeURIComponent(code)}`),
};
