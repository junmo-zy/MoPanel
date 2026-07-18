FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev && npm cache clean --force

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080

COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY server ./server
COPY --from=build /app/dist ./dist

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8080/health >/dev/null || exit 1

CMD ["node", "server/index.mjs"]
