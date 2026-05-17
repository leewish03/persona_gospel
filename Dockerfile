FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY server.js ./
COPY data ./data
COPY docs ./docs
COPY prompts ./prompts
COPY public ./public
COPY components.json index.html jsconfig.json vite.config.js ./
COPY src ./src

RUN npm ci && npm run build && mkdir -p /app/storage

ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

CMD ["node", "server.js"]
