# TODO: optimize Dockerfile, install production only

FROM oven/bun:1.1.42

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install

COPY prisma/schema.prisma ./prisma/
RUN bunx prisma generate

COPY . .