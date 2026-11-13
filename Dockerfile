# One image runs the whole game: the server also serves the built web client.
FROM node:22-alpine
RUN npm install --global pnpm@12.11.2
WORKDIR /app

# Install dependencies first, so this layer is reused until a package.json changes.
# Every workspace manifest is copied so the lockfile matches, but only the server and
# the web client (and the packages they use) are installed: the mobile app's React
# Native dependencies stay out of this image.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/engine/package.json packages/engine/
COPY packages/protocol/package.json packages/protocol/
COPY packages/client/package.json packages/client/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
RUN pnpm install --frozen-lockfile --filter "@cort/server..." --filter "@cort/web..."

COPY . .
RUN pnpm build

ENV NODE_ENV=production
# The host (Railway) sets PORT; 8787 is the fallback for running the image locally.
EXPOSE 8787
CMD ["pnpm", "start:server"]
