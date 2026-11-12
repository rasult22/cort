# One image runs the whole game: the server also serves the built web client.
FROM node:22-alpine
RUN npm install --global pnpm@12.11.2
WORKDIR /app

# Install dependencies first, so this layer is reused until a package.json changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/engine/package.json packages/engine/
COPY packages/protocol/package.json packages/protocol/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production
# The host (Railway) sets PORT; 8787 is the fallback for running the image locally.
EXPOSE 8787
CMD ["pnpm", "start:server"]
