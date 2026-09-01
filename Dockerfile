FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci

COPY client/ client/
RUN npm run build --workspace=client

FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci --workspace=server --omit=dev

COPY server/ server/
COPY --from=build /app/client/dist client/dist

ENV NODE_ENV=production

CMD ["node", "server/index.js"]
