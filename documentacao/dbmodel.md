---
title: Chat4All v2 - Diagrama ER
---
erDiagram

%% ===========================
%% 🧱 DOMÍNIO (CockroachDB)
%% ===========================
    USERS {
        UUID id PK
        STRING username
        STRING display_name
        STRING email
        TIMESTAMPTZ created_at
        TIMESTAMPTZ last_seen_at
    }

    USER_CHANNELS {
        UUID id PK
        UUID user_id FK
        STRING platform
        STRING external_id
        TIMESTAMPTZ linked_at
    }

    CONVERSATIONS {
        UUID id PK
        STRING type
        STRING name
        UUID created_by FK
        TIMESTAMPTZ created_at
        JSONB metadata
    }

    CONVERSATION_MEMBERS {
        UUID conversation_id FK
        UUID user_id FK
        STRING role
        TIMESTAMPTZ joined_at
        BIGINT last_read_seq
    }

%% RELAÇÕES DOMÍNIO
    USERS ||--o{ USER_CHANNELS : possui
    USERS ||--o{ CONVERSATION_MEMBERS : participa
    CONVERSATIONS ||--o{ CONVERSATION_MEMBERS : contém
    USERS ||--o{ CONVERSATIONS : cria


%% ===========================
%% 🗂️ MENSAGERIA (MongoDB)
%% ===========================
    MESSAGES {
        UUID _id PK
        UUID conversation_id FK
        UUID message_id
        UUID from
        STRING[] to
        JSON payload
        JSON metadata
        BIGINT seq
        JSON status
        TIMESTAMPTZ created_at
    }

    MESSAGE_STATUS {
        UUID _id PK
        UUID conversation_id FK
        JSON states
    }

    PENDING_DELIVERY_CURSOR {
        UUID _id PK
        UUID user_id FK
        UUID conversation_id FK
        BIGINT last_delivered_seq
        BIGINT last_read_seq
        TIMESTAMPTZ updated_at
    }

    FILES_METADATA {
        UUID _id PK
        UUID conversation_id FK
        UUID owner_id FK
        STRING name
        STRING mime_type
        STRING checksum
        STRING storage_path
        BIGINT size
        TIMESTAMPTZ created_at
    }

%% RELAÇÕES MENSAGERIA
    CONVERSATIONS ||--o{ MESSAGES : possui
    CONVERSATIONS ||--o{ FILES_METADATA : referencia
    USERS ||--o{ FILES_METADATA : envia
    MESSAGES ||--o{ MESSAGE_STATUS : estado
    USERS ||--o{ PENDING_DELIVERY_CURSOR : leitura


%% ===========================
%% 🪣 OBJECT STORAGE (MinIO)
%% ===========================
    OBJECT_STORAGE {
        STRING bucket
        STRING object_key PK
        UUID file_id FK
        UUID conversation_id FK
        STRING type
        TIMESTAMPTZ created_at
    }

    FILES_METADATA ||--o{ OBJECT_STORAGE : vincula


%% ===========================
%% ⚙️ INFRAESTRUTURA (CockroachDB)
%% ===========================
    CONNECTORS {
        UUID id PK
        STRING name
        STRING status
        JSONB config
        TIMESTAMPTZ updated_at
    }

    WEBHOOKS {
        UUID id PK
        STRING connector_name FK
        STRING target_url
        STRING secret_token
        TIMESTAMPTZ created_at
    }

    CONNECTORS ||--o{ WEBHOOKS : define




