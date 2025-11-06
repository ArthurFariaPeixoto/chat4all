import { Kafka } from 'kafkajs';

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9093';
const TOPIC = 'messages.send';

async function testKafkaPublish() {
  console.log('🧪 Testing Kafka Producer...\n');
  console.log(`📡 Connecting to Kafka at ${KAFKA_BROKER}...\n`);

  const kafka = new Kafka({
    clientId: 'test-producer',
    brokers: [KAFKA_BROKER],
  });

  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: 'test-consumer-group' });

  try {
    // Conectar producer
    await producer.connect();
    console.log('✅ Producer connected\n');

    // Conectar consumer para verificar mensagem
    await consumer.connect();
    await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
    console.log('✅ Consumer subscribed to topic\n');

    // Publicar mensagem de teste
    const testMessage = {
      message_id: `test-${Date.now()}`,
      conversation_id: 'conv-test-123',
      from: 'user-1',
      to: ['user-2'],
      channels: ['whatsapp'],
      payload: {
        type: 'TEXT',
        text: 'Hello, this is a test message!',
      },
      metadata: {
        test: 'true',
      },
      priority: 'NORMAL',
      timestamp: Date.now(),
    };

    console.log('📤 Publishing test message...');
    console.log('Message:', JSON.stringify(testMessage, null, 2));
    console.log('');

    const result = await producer.send({
      topic: TOPIC,
      messages: [
        {
          key: testMessage.conversation_id,
          value: JSON.stringify(testMessage),
          headers: {
            'message-id': testMessage.message_id,
            'conversation-id': testMessage.conversation_id,
            'from': testMessage.from,
            'timestamp': testMessage.timestamp.toString(),
          },
        },
      ],
    });

    console.log('✅ Message published successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('');

    // Consumir mensagem para verificar
    console.log('📥 Waiting for message consumption...');
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        console.log('✅ Message consumed!');
        console.log('Topic:', topic);
        console.log('Partition:', partition);
        console.log('Offset:', message.offset);
        console.log('Key:', message.key?.toString());
        console.log('Headers:', message.headers);
        console.log('Value:', message.value?.toString());
        console.log('');

        // Desconectar após receber mensagem
        await consumer.disconnect();
        await producer.disconnect();
        process.exit(0);
      },
    });

    // Timeout de 10 segundos
    setTimeout(async () => {
      console.log('⏱️ Timeout: No message received');
      await consumer.disconnect();
      await producer.disconnect();
      process.exit(1);
    }, 10000);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error('Details:', error);
    await producer.disconnect().catch(() => {});
    await consumer.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Executar teste
testKafkaPublish().catch(console.error);

