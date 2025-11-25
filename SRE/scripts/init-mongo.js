// Script executado no Mongos (Router)

print("Starting Sharding Initialization...");

// 1. Adicionar Shards ao Cluster
// É necessário adicionar explicitamente cada réplica set como um shard
// O mongos precisa saber onde os dados podem ser armazenados
try {
    sh.addShard("shard1RS/mongo-shard1:27018");
    print("Shard1 added successfully");
} catch (e) {
    print("Shard1 might already exist: " + e);
}

try {
    sh.addShard("shard2RS/mongo-shard2:27020");
    print("Shard2 added successfully");
} catch (e) {
    print("Shard2 might already exist: " + e);
}

// 2. Habilitar Sharding no Database
sh.enableSharding("app_db");
print("Sharding enabled for database 'app_db'");

// 3. Garantir que a coleção usa a chave de shard correta
// Mudando para o banco de dados correto
db = db.getSiblingDB("app_db");

// Criar índice hashed para distribuição uniforme baseada no ID da conversa
// Hashed Sharding é ideal para evitar hotspots de escrita sequencial
db.messages.createIndex({ "conversation_id": "hashed" });
print("Hashed index created on 'conversation_id'");

// 4. Fragmentar a coleção
// Isso distribui os dados entre os shards disponíveis (shard1 e shard2)
// O Balancer do MongoDB irá mover os chunks automaticamente entre os shards
// para manter o equilíbrio, sem downtime.
sh.shardCollection("app_db.messages", { "conversation_id": "hashed" });
print("Collection 'app_db.messages' sharded using 'conversation_id' (hashed)");

print("Sharding Initialization Completed Successfully.");
