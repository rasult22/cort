import type { GameState, Rules } from '@cort/engine';
import type { MatchHand } from '@cort/protocol';
import { boolean, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const moment = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
    id: uuid('id').primaryKey(),
    /** Google's stable id for the account; null for accounts made by the development sign-in. */
    googleSub: text('google_sub').unique(),
    email: text('email'),
    /** The name shown at the table. */
    name: text('name').notNull(),
    /** The photo that came with the Google account. */
    photo: text('photo'),
    /** What others see: 'photo', 'none' or 'preset:<n>'. */
    avatar: text('avatar').notNull().default('photo'),
    createdAt: moment('created_at').notNull().defaultNow(),
});

export const sessions = pgTable(
    'sessions',
    {
        /** SHA-256 of the token the browser holds: a leaked table does not let anyone in. */
        id: text('id').primaryKey(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        createdAt: moment('created_at').notNull().defaultNow(),
        expiresAt: moment('expires_at').notNull(),
    },
    (table) => [index('sessions_user').on(table.userId)],
);

/** One finished match. */
export const matches = pgTable(
    'matches',
    {
        id: uuid('id').primaryKey(),
        roomCode: text('room_code').notNull(),
        startedAt: moment('started_at').notNull(),
        endedAt: moment('ended_at').notNull(),
        /** With `actions`, enough to replay the whole match: the engine is deterministic. */
        seed: integer('seed').notNull(),
        rules: jsonb('rules').$type<Rules>().notNull(),
        actions: text('actions').notNull(),
        score0: smallint('score_0').notNull(),
        score1: smallint('score_1').notNull(),
        winner: smallint('winner').notNull(),
        hands: jsonb('hands').$type<MatchHand[]>().notNull(),
    },
    (table) => [index('matches_ended').on(table.endedAt)],
);

/** Who sat where in a match, and how it went for them. */
export const matchPlayers = pgTable(
    'match_players',
    {
        matchId: uuid('match_id')
            .notNull()
            .references(() => matches.id, { onDelete: 'cascade' }),
        seat: smallint('seat').notNull(),
        kind: text('kind').$type<'human' | 'bot'>().notNull(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
        /** A guest's device: lets their games move to an account when they sign in. */
        deviceId: text('device_id'),
        name: text('name').notNull(),
        avatar: text('avatar'),
        won: boolean('won').notNull(),
        handsWon: smallint('hands_won').notNull(),
        /** Hands won without giving away a trick. */
        dryWins: smallint('dry_wins').notNull(),
        /** Hands in which this seat named trump. */
        calls: smallint('calls').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.matchId, table.seat] }),
        index('match_players_user').on(table.userId),
        index('match_players_device').on(table.deviceId),
    ],
);

/** What a table needs to carry on after the server restarts. */
export interface RoomSnapshot {
    code: string;
    title: string;
    open: boolean;
    host: number;
    members: (SavedMember | null)[];
    game: GameState | null;
    match: SavedMatch | null;
}

export interface SavedMember {
    name: string;
    avatar: string | null;
    userId: string | null;
    deviceId: string | null;
    token: string;
    idle: boolean;
}

/** The match in progress, as far as it has been played. */
export interface SavedMatch {
    startedAt: number;
    seed: number;
    hands: (Omit<MatchHand, 'winner'> & { winner: 0 | 1 | null })[];
    actions: string[];
}

/** Tables in progress, so a deploy does not end the evening. */
export const rooms = pgTable('rooms', {
    code: text('code').primaryKey(),
    data: jsonb('data').$type<RoomSnapshot>().notNull(),
    updatedAt: moment('updated_at').notNull().defaultNow(),
});
