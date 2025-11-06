-- Schema SQL para CockroachDB
-- Execute este script no seu banco de dados CockroachDB

-- Limpar schema existente (remover tabelas na ordem correta devido às foreign keys)
DROP TABLE IF EXISTS conversation_members CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Criar tabela users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username STRING NOT NULL,
    email STRING,
    password STRING NOT NULL,
    display_name STRING,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Criar índices únicos para users
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (username);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email) WHERE email IS NOT NULL;

-- Criar índices adicionais para users
CREATE INDEX IF NOT EXISTS users_username_idx ON users (username);
CREATE INDEX IF NOT EXISTS users_email_idx ON users (email) WHERE email IS NOT NULL;

-- Criar tabela conversations
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type STRING NOT NULL,
    name STRING,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived BOOL NOT NULL DEFAULT false,
    metadata JSONB
);

-- Criar foreign key para conversations
ALTER TABLE conversations 
    ADD CONSTRAINT conversations_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;

-- Criar tabela conversation_members
CREATE TABLE IF NOT EXISTS conversation_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role STRING NOT NULL DEFAULT 'MEMBER',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_read_seq INT8 DEFAULT 0,
    last_delivered_seq INT8 DEFAULT 0
);

-- Criar foreign keys para conversation_members
ALTER TABLE conversation_members 
    ADD CONSTRAINT conversation_members_conversation_id_fkey 
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE conversation_members 
    ADD CONSTRAINT conversation_members_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Criar constraint única para conversation_members
CREATE UNIQUE INDEX IF NOT EXISTS conversation_members_conversation_id_user_id_key 
    ON conversation_members (conversation_id, user_id);

-- Criar função para atualizar updated_at automaticamente (se necessário)
-- CockroachDB não suporta triggers da mesma forma que PostgreSQL,
-- mas podemos criar uma função que pode ser chamada manualmente ou via aplicação
-- Alternativamente, você pode usar a funcionalidade @updatedAt do Prisma

-- Nota: Para atualizar automaticamente o updated_at, você pode usar:
-- ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT now();
-- Mas isso não atualiza automaticamente. O Prisma Client faz isso.

-- Conceder permissões ao usuário da aplicação
-- Nota: Execute como um usuário com privilégios de administrador (ex: root)
-- Substitua 'app_user' pelo nome do seu usuário se for diferente

-- Permissões na tabela users
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users TO app_user;

-- Permissões na tabela conversations
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE conversations TO app_user;

-- Permissões na tabela conversation_members
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE conversation_members TO app_user;

-- Permissões nos índices (necessário para algumas operações)
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_user;
