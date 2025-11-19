FROM node:20-alpine

WORKDIR /usr/src/app

# Copiar arquivos de dependências
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY src ./src

# Compilar TypeScript
RUN npm run build

# Expor porta (se necessário)
# EXPOSE <porta>

# Comando padrão
CMD ["npm", "start"]

