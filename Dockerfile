FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY data ./data
COPY docs ./docs
COPY prompts ./prompts
COPY public ./public

RUN mkdir -p /app/storage

ENV NODE_ENV=production
ENV PORT=4173

EXPOSE 4173

CMD ["node", "server.js"]
