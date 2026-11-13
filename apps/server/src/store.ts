import type { Rules, Seat, Team } from '@cort/engine';
import {
    MAX_NAME,
    presetIndex,
    type Account,
    type HistoryResponse,
    type MatchHand,
    type MatchSummary,
    type PlayerStats,
    type Rival,
} from '@cort/protocol';
import { and, desc, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Db } from './db/open';
import { matchPlayers, matches, rooms, sessions, users, type RoomSnapshot } from './db/schema';

const SESSION_DAYS = 60;
const DAY_MS = 24 * 60 * 60_000;
const RECENT_MATCHES = 30;
/** How far back the record against particular people looks. */
const RIVAL_ROWS = 3000;
const MAX_RIVALS = 12;
/** Table snapshots are written at most this often per table. */
const ROOM_WRITE_MS = 250;

export type User = typeof users.$inferSelect;

/** A finished match, as the table hands it over for keeping. */
export interface MatchRecord {
    roomCode: string;
    startedAt: number;
    endedAt: number;
    seed: number;
    rules: Rules;
    score: [number, number];
    winner: Team;
    hands: MatchHand[];
    actions: string[];
    players: {
        seat: Seat;
        kind: 'human' | 'bot';
        userId: string | null;
        deviceId: string | null;
        name: string;
        avatar: string | null;
    }[];
}

export interface GoogleProfile {
    sub: string;
    email: string | null;
    name: string;
    picture: string | null;
}

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export const cleanName = (raw: unknown): string =>
    String(raw ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_NAME);

/** What other people see next to this person's name. */
export function shownAvatar(user: Pick<User, 'avatar' | 'photo'>): string | null {
    if (user.avatar === 'photo') return user.photo;
    return presetIndex(user.avatar) !== null ? user.avatar : null;
}

export const toAccount = (user: User): Account => ({
    id: user.id,
    name: user.name,
    avatar: shownAvatar(user),
    photo: user.photo,
    email: user.email,
});

/** Everything the server keeps between restarts. */
export class Store {
    private pendingRooms = new Map<string, RoomSnapshot>();
    private roomTimer: ReturnType<typeof setTimeout> | null = null;
    private roomWrites: Promise<void> = Promise.resolve();

    constructor(private readonly db: Db) {}

    /* ───────── Accounts ───────── */

    /** Finds the account for a Google profile, creating it on the first sign-in. */
    async signInWithGoogle(profile: GoogleProfile): Promise<User> {
        const [existing] = await this.db.select().from(users).where(eq(users.googleSub, profile.sub));
        if (existing) {
            // The name and the avatar choice are the person's own; only what Google owns is refreshed.
            const [updated] = await this.db
                .update(users)
                .set({ email: profile.email, photo: profile.picture })
                .where(eq(users.id, existing.id))
                .returning();
            return updated;
        }
        const [created] = await this.db
            .insert(users)
            .values({
                id: randomUUID(),
                googleSub: profile.sub,
                email: profile.email,
                name: cleanName(profile.name) || 'Игрок',
                photo: profile.picture,
                avatar: profile.picture ? 'photo' : 'none',
            })
            .returning();
        return created;
    }

    /** An account without Google behind it, for development and tests. */
    async signInForDevelopment(name: string): Promise<User> {
        const clean = cleanName(name) || 'Игрок';
        const sub = `dev:${clean.toLowerCase()}`;
        const [existing] = await this.db.select().from(users).where(eq(users.googleSub, sub));
        if (existing) return existing;
        const [created] = await this.db
            .insert(users)
            .values({ id: randomUUID(), googleSub: sub, email: null, name: clean, photo: null, avatar: 'none' })
            .returning();
        return created;
    }

    async updateProfile(userId: string, changes: { name?: string; avatar?: string }): Promise<User | null> {
        const set: Partial<Pick<User, 'name' | 'avatar'>> = {};
        if (changes.name !== undefined) {
            const name = cleanName(changes.name);
            if (name) set.name = name;
        }
        if (changes.avatar !== undefined) {
            const avatar = changes.avatar;
            if (avatar === 'photo' || avatar === 'none' || presetIndex(avatar) !== null) set.avatar = avatar;
        }
        if (Object.keys(set).length === 0) return this.user(userId);
        const [updated] = await this.db.update(users).set(set).where(eq(users.id, userId)).returning();
        return updated ?? null;
    }

    async user(userId: string): Promise<User | null> {
        const [found] = await this.db.select().from(users).where(eq(users.id, userId));
        return found ?? null;
    }

    /** Removes the account. Matches stay for the other players, without this person's name on them. */
    async deleteAccount(userId: string): Promise<void> {
        await this.db.update(matchPlayers).set({ name: 'Игрок', avatar: null, userId: null }).where(eq(matchPlayers.userId, userId));
        await this.db.delete(users).where(eq(users.id, userId));
    }

    /* ───────── Sessions ───────── */

    /** Returns the secret the browser keeps; only its hash is stored. */
    async createSession(userId: string): Promise<string> {
        const token = randomBytes(32).toString('base64url');
        await this.db.insert(sessions).values({ id: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_DAYS * DAY_MS) });
        return token;
    }

    async userBySession(token: string | undefined | null): Promise<User | null> {
        if (!token) return null;
        const [row] = await this.db
            .select({ user: users, expiresAt: sessions.expiresAt })
            .from(sessions)
            .innerJoin(users, eq(users.id, sessions.userId))
            .where(eq(sessions.id, hashToken(token)));
        if (!row || row.expiresAt.getTime() < Date.now()) return null;
        return row.user;
    }

    async endSession(token: string): Promise<void> {
        await this.db.delete(sessions).where(eq(sessions.id, hashToken(token)));
    }

    async forgetExpiredSessions(): Promise<void> {
        await this.db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    }

    /* ───────── Matches ───────── */

    async saveMatch(record: MatchRecord): Promise<string> {
        const id = randomUUID();
        // The match and its four seats are one fact: both are written, or neither.
        await this.db.transaction(async (tx) => {
            await tx.insert(matches).values({
                id,
                roomCode: record.roomCode,
                startedAt: new Date(record.startedAt),
                endedAt: new Date(record.endedAt),
                seed: record.seed,
                rules: record.rules,
                actions: record.actions.join(' '),
                score0: record.score[0],
                score1: record.score[1],
                winner: record.winner,
                hands: record.hands,
            });
            await tx.insert(matchPlayers).values(
                record.players.map((player) => {
                    const team = player.seat % 2;
                    const won = record.hands.filter((hand) => hand.winner === team);
                    return {
                        matchId: id,
                        seat: player.seat,
                        kind: player.kind,
                        userId: player.userId,
                        deviceId: player.userId ? null : player.deviceId,
                        name: player.name,
                        avatar: player.avatar,
                        won: record.winner === team,
                        handsWon: won.length,
                        dryWins: won.filter((hand) => hand.tricks[1 - team] === 0).length,
                        calls: record.hands.filter((hand) => hand.caller === player.seat).length,
                    };
                }),
            );
        });
        return id;
    }

    /** Games played as a guest on this device become the account's games. */
    async claimDevice(userId: string, deviceId: string): Promise<void> {
        await this.db
            .update(matchPlayers)
            .set({ userId, deviceId: null })
            .where(and(eq(matchPlayers.deviceId, deviceId), isNull(matchPlayers.userId)));
    }

    async history(userId: string): Promise<HistoryResponse> {
        const count = (condition: unknown) => sql<number>`coalesce(sum(case when ${condition} then 1 else 0 end), 0)`.mapWith(Number);
        const total = (column: unknown) => sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number);

        const [totals] = await this.db
            .select({
                matches: sql<number>`count(*)`.mapWith(Number),
                wins: count(matchPlayers.won),
                hands: total(sql`${matches.score0} + ${matches.score1}`),
                handsWon: total(matchPlayers.handsWon),
                dryWins: total(matchPlayers.dryWins),
                calls: total(matchPlayers.calls),
            })
            .from(matchPlayers)
            .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
            .where(eq(matchPlayers.userId, userId));
        const stats: PlayerStats = totals ?? { matches: 0, wins: 0, hands: 0, handsWon: 0, dryWins: 0, calls: 0 };

        const mine = await this.db
            .select({ match: matches, seat: matchPlayers.seat, won: matchPlayers.won })
            .from(matchPlayers)
            .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
            .where(eq(matchPlayers.userId, userId))
            .orderBy(desc(matches.endedAt))
            .limit(RECENT_MATCHES);

        const everyone = mine.length
            ? await this.db
                  .select()
                  .from(matchPlayers)
                  .where(
                      inArray(
                          matchPlayers.matchId,
                          mine.map((row) => row.match.id),
                      ),
                  )
            : [];

        const recent: MatchSummary[] = mine.map(({ match, seat, won }) => ({
            id: match.id,
            endedAt: match.endedAt.toISOString(),
            duration: Math.max(0, Math.round((match.endedAt.getTime() - match.startedAt.getTime()) / 1000)),
            mySeat: seat as Seat,
            won,
            score: [match.score0, match.score1],
            hands: match.hands,
            players: everyone
                .filter((player) => player.matchId === match.id)
                .sort((a, b) => a.seat - b.seat)
                .map((player) => ({
                    seat: player.seat as Seat,
                    name: player.name,
                    kind: player.kind,
                    avatar: player.avatar,
                    me: player.seat === seat,
                })),
        }));

        return { stats, matches: recent, rivals: await this.rivals(userId) };
    }

    /** Our record with and against each person we have played with, most familiar first. */
    private async rivals(userId: string): Promise<Rival[]> {
        const me = alias(matchPlayers, 'me');
        const other = alias(matchPlayers, 'other');
        const rows = await this.db
            .select({
                mySeat: me.seat,
                won: me.won,
                seat: other.seat,
                userId: other.userId,
                deviceId: other.deviceId,
                name: other.name,
                avatar: other.avatar,
            })
            .from(me)
            .innerJoin(other, and(eq(other.matchId, me.matchId), ne(other.seat, me.seat)))
            .innerJoin(matches, eq(matches.id, me.matchId))
            .where(and(eq(me.userId, userId), eq(other.kind, 'human')))
            .orderBy(desc(matches.endedAt))
            .limit(RIVAL_ROWS);

        const people = new Map<string, Rival>();
        for (const row of rows) {
            if (row.userId === userId) continue;
            const key = row.userId ?? row.deviceId ?? `name:${row.name}`;
            // Rows come newest first, so the first one seen carries the person's current name.
            const rival = people.get(key) ?? {
                name: row.name,
                avatar: row.avatar,
                together: { matches: 0, wins: 0 },
                against: { matches: 0, wins: 0 },
            };
            const side = row.seat % 2 === row.mySeat % 2 ? rival.together : rival.against;
            side.matches += 1;
            if (row.won) side.wins += 1;
            people.set(key, rival);
        }
        const games = (rival: Rival) => rival.together.matches + rival.against.matches;
        return [...people.values()].sort((a, b) => games(b) - games(a)).slice(0, MAX_RIVALS);
    }

    /* ───────── Tables in progress ───────── */

    /** Remembers the table's latest state; the write itself happens a moment later, once per burst. */
    saveRoom(code: string, snapshot: RoomSnapshot): void {
        this.pendingRooms.set(code, snapshot);
        this.roomTimer ??= setTimeout(() => void this.flushRooms(), ROOM_WRITE_MS);
    }

    removeRoom(code: string): void {
        this.pendingRooms.delete(code);
        this.roomWrites = this.roomWrites
            .then(() => this.db.delete(rooms).where(eq(rooms.code, code)))
            .then(noop, logFailure('удалить стол'));
    }

    /** Writes everything that is waiting. Call before shutting down. */
    flushRooms(): Promise<void> {
        if (this.roomTimer) clearTimeout(this.roomTimer);
        this.roomTimer = null;
        const batch = [...this.pendingRooms];
        this.pendingRooms.clear();
        for (const [code, data] of batch) {
            this.roomWrites = this.roomWrites
                .then(() =>
                    this.db
                        .insert(rooms)
                        .values({ code, data, updatedAt: new Date() })
                        .onConflictDoUpdate({ target: rooms.code, set: { data, updatedAt: new Date() } }),
                )
                .then(noop, logFailure('сохранить стол'));
        }
        return this.roomWrites;
    }

    /** Tables saved recently enough that their players may still come back; older ones are dropped. */
    async loadRooms(maxAgeMs: number): Promise<RoomSnapshot[]> {
        await this.db.delete(rooms).where(lt(rooms.updatedAt, new Date(Date.now() - maxAgeMs)));
        const rows = await this.db.select().from(rooms);
        return rows.map((row) => row.data);
    }
}

const noop = (): void => {};
const logFailure = (what: string) => (error: unknown) => console.error(`Не удалось ${what}:`, error);
