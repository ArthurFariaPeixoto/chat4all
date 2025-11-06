FROM node:20-alpine

WORKDIR /usr/src/app

# Instalar dependências de build para módulos nativos (bcrypt)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    wget

# Copiar arquivos de dependências
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY . .

# Gerar Prisma Client
# Nota: proto files são montados via volume no docker-compose
RUN npx prisma generate --schema=./prisma/schema.prisma

# Expor portas
EXPOSE 3000 50051

# Comando padrão (será sobrescrito no docker-compose)
CMD ["npm", "run", "start:dev"]

