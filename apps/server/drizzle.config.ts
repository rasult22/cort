import { defineConfig } from 'drizzle-kit';

// Only used to write migrations: `pnpm --filter @cort/server db:generate` after changing src/db/schema.ts.
export default defineConfig({
    dialect: 'postgresql',
    schema: './src/db/schema.ts',
    out: './drizzle',
});
