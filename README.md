# Chat4All - Plataforma de Comunicação Ubíqua 💬

![UFG Badge](https://img.shields.io/badge/UFG-Sistemas%20Distribu%C3%ADdos-blue)
![NestJS Badge](https://img.shields.io/badge/Backend-NestJS-red)
![gRPC Badge](https://img.shields.io/badge/Protocol-gRPC-green)
![Status Badge](https://img.shields.io/badge/Status-Em%20Desenvolvimento-yellow)

Trabalho prático da disciplina de **Sistemas Distribuídos (2025/2)** do Instituto de Informática da Universidade Federal de Goiás (UFG).

👨‍💻 Colaboradores

- Arthur Faria Peixoto
- Geovanna Cunha Andrade Silva
- Guilherme Ferreira de Oliveira
- Sergio Natan Costa Barbosa

---

## Sobre o Projeto

O **Chat4All** é uma API de comunicação distribuída projetada para permitir a interação entre usuários através de múltiplos canais (como WhatsApp, Telegram e Web) a partir de um único ponto de entrada. O sistema implementa uma arquitetura orientada a eventos para garantir consistência eventual, escalabilidade horizontal e tolerância a falhas.

### Principais Funcionalidades
* **Mensageria Híbrida:** Suporte a chat privado (1-1) e grupos.
* **Multimídia:** Suporte a envio de texto, imagens, vídeos e áudio.
* **Alta Disponibilidade:** Arquitetura resiliente utilizando CockroachDB (dados relacionais) e MongoDB (histórico de mensagens).
* **Comunicação Eficiente:** Uso de gRPC para comunicação interna e externa de baixa latência.

---

## Arquitetura e Modelagem

O sistema utiliza uma arquitetura de microsserviços com **Apache Kafka** atuando como backbone de mensageria para desacoplar o envio do processamento e persistência.

### Decisões Arquiteturais e Persistência

A arquitetura utiliza uma abordagem poliglota para maximizar a eficiência:

| Tecnologia | Função no Sistema | Justificativa (Trade-off) |
| :--- | :--- | :--- |
| **CockroachDB** | Dados críticos (Usuários, Grupos) | Garante consistência forte e transações ACID em ambiente distribuído. |
| **MongoDB** | Histórico de Mensagens | Alta performance de escrita (Write-heavy) e flexibilidade de schema (Schema-less). |
| **Redis** | Cache e Presença | Baixa latência para dados efêmeros (Status Online/Offline e Locks). |
| **MinIO** | Armazenamento de Arquivos | Compatibilidade com S3 para grandes volumes de dados não estruturados (Blobs). |
---

## Instruções de Uso

### Pré-requisitos
* Node.js (v18+)
* Docker & Docker Compose (Obrigatório para infraestrutura de bancos e filas)

### 1. Configuração de Ambiente
Na raiz do projeto (ou na pasta `services/gateway-api`), configure as variáveis de ambiente:

```bash
cp .env.example .env
# Ajuste as portas no .env se necessário (Padrão: 5000 ou 3000)
```

### 2. Subir Infraestrutura (Docker)

Antes de rodar a aplicação, inicie os serviços de banco de dados e mensageria:

```bash
# Na raiz onde está o docker-compose.yml
docker-compose up -d
```

### 3. Rodar a Aplicação (Gateway API)
Entre na pasta do serviço principal e inicie:

```bash
cd services
nest start --watch
# A API rodará na porta definida no .env (Ex: 5000 ou 3000).
```

Para mais detalhes: [README - Gateway API](https://github.com/ArthurFariaPeixoto/chat4all/blob/main/services/gateway-api/README.md)

### 4. Rodar o Web Client (Interface de Teste)
Para testar os endpoints gRPC via interface gráfica:

```bash
cd services/client-web
npm install
npm start
# Acesse no navegador: http://localhost:8081.
```

Para mais detalhes: [README - Web Client](https://github.com/ArthurFariaPeixoto/chat4all/blob/main/services/client-web/README.md)


### 5. Detalhes sobre o Setup: [README - SETUP](https://github.com/ArthurFariaPeixoto/chat4all/blob/main/SETUP.md)

---

## Outros README:
- [README - Message Consumer](https://github.com/ArthurFariaPeixoto/chat4all/blob/main/services/message-consumer/README.md)
- [README - Proto](https://github.com/ArthurFariaPeixoto/chat4all/blob/main/services/proto/README.md)
