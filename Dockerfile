FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock* package-lock.json* ./

RUN npm ci --only=production || yarn install --frozen-lockfile --production

COPY . .

RUN npm run build || yarn build

FROM node:20-alpine

WORKDIR /app

COPY package.json yarn.lock* package-lock.json* ./

RUN npm ci --only=production || yarn install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist

RUN mkdir -p logs

EXPOSE 3001

CMD ["node", "dist/server.js"]


