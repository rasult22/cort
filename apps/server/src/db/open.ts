import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface OpenDb {
    db: Db;
    /** A line for the startup log saying where the data lives. */
    describe: string;
    close(): Promise<void>;
}

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));
/** A database on a private network may become reachable a moment after the process starts. */
const CONNECT_ATTEMPTS = 8;
const CONNECT_PAUSE_MS = 1500;

async function patiently(task: () => Promise<void>): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await task();
        } catch (error) {
            if (attempt >= CONNECT_ATTEMPTS) throw error;
            // The query builder wraps the real reason (refused, unknown host…) in its own error.
            const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
            const reason = (cause instanceof Error ? cause.message : String(cause)).split(/\r?\n/)[0];
            console.warn(`База пока не отвечает (попытка ${attempt} из ${CONNECT_ATTEMPTS}): ${reason}`);
            await new Promise((resolve) => setTimeout(resolve, CONNECT_PAUSE_MS));
        }
    }
}

/**
 * Opens the database and brings its tables up to date.
 *
 * With `url` it is a real Postgres (production). Without it the data lives in
 * PGlite — Postgres compiled to run inside this process — in `dataDir`, or in
 * memory when that is omitted too. Same SQL either way, so development and
 * tests need nothing installed.
 */
export async function openDb(options: { url?: string; dataDir?: string } = {}): Promise<OpenDb> {
    if (options.url) {
        const { default: pg } = await import('pg');
        const { drizzle } = await import('drizzle-orm/node-postgres');
        const { migrate } = await import('drizzle-orm/node-postgres/migrator');
        const pool = new pg.Pool({ connectionString: options.url, max: 10 });
        // A dropped idle connection must not take the whole server down with it.
        pool.on('error', (error) => console.error('Postgres:', error.message));
        const db = drizzle(pool, { schema });
        await patiently(() => migrate(db, { migrationsFolder: MIGRATIONS }));
        return { db: db as unknown as Db, describe: 'Postgres', close: () => pool.end() };
    }

    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    if (options.dataDir) mkdirSync(options.dataDir, { recursive: true });
    const client = new PGlite(options.dataDir);
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return {
        db: db as unknown as Db,
        describe: options.dataDir ? `PGlite в ${options.dataDir}` : 'PGlite в памяти',
        close: () => client.close(),
    };
}
