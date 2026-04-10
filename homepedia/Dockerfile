FROM node:alpine

WORKDIR /usr/share/app

RUN apk add --no-cache bash curl git

RUN npm install -g pnpm

CMD ["sh", "-c", "pnpm install && pnpm run dev"]