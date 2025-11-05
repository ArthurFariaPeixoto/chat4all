# Build stage
FROM node:18-alpine AS builder
WORKDIR /usr/src/app

# Instalar dependências
COPY package.json package-lock.json* yarn.lock* ./
# se usa yarn: RUN yarn install --frozen-lockfile
RUN npm ci --silent

# Copiar código e buildar
COPY . .
RUN npm run build

# Production image
FROM node:18-alpine AS runner
WORKDIR /usr/src/app

ENV NODE_ENV=production
# copiar apenas o necessário
COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]
