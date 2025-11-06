import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';

const PROTO_PATH = join(__dirname, '../../proto/chat4all/v1');
const GRPC_HOST = process.env.GRPC_HOST || 'localhost:50051';

async function testAuth() {
  console.log('🧪 Testing AuthService...\n');

  // Carregar proto files
  const packageDefinition = protoLoader.loadSync(
    [
      join(PROTO_PATH, 'common.proto'),
      join(PROTO_PATH, 'auth.proto'),
    ],
    {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    },
  );

  const proto = grpc.loadPackageDefinition(packageDefinition) as any;
  const chat4all = proto.chat4all.v1;

  // Criar cliente gRPC
  const client = new chat4all.AuthService(
    GRPC_HOST,
    grpc.credentials.createInsecure(),
  );

  console.log(`📡 Connecting to gRPC server at ${GRPC_HOST}...\n`);

  // Test 1: GetToken com client_credentials
  console.log('1️⃣ Testing GetToken (client_credentials)...');
  try {
    const tokenResponse = await new Promise((resolve, reject) => {
      client.GetToken(
        {
          client_id: 'test-client-123',
          client_secret: 'test-secret',
          grant_type: 'client_credentials',
        },
        (error: any, response: any) => {
          if (error) reject(error);
          else resolve(response);
        },
      );
    });

    console.log('✅ GetToken successful!');
    console.log('Response type:', typeof tokenResponse);
    console.log('Response keys:', Object.keys(tokenResponse || {}));
    console.log('Response:', JSON.stringify(tokenResponse, null, 2));
    console.log('Raw response object:', tokenResponse);
    console.log('');

    // Test 2: ValidateToken
    const accessToken = (tokenResponse as any).access_token;
    if (accessToken) {
      console.log('2️⃣ Testing ValidateToken...');
      const validateResponse = await new Promise((resolve, reject) => {
        client.ValidateToken(
          { token: accessToken },
          (error: any, response: any) => {
            if (error) reject(error);
            else resolve(response);
          },
        );
      });

      console.log('✅ ValidateToken successful!');
      console.log('Response:', JSON.stringify(validateResponse, null, 2));
      console.log('');

      // Test 3: RefreshToken
      const refreshToken = (tokenResponse as any).refresh_token;
      if (refreshToken) {
        console.log('3️⃣ Testing RefreshToken...');
        const refreshResponse = await new Promise((resolve, reject) => {
          client.RefreshToken(
            { refresh_token: refreshToken },
            (error: any, response: any) => {
              if (error) reject(error);
              else resolve(response);
            },
          );
        });

        console.log('✅ RefreshToken successful!');
        console.log('Response:', JSON.stringify(refreshResponse, null, 2));
        console.log('');
      }
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error('Details:', error);
  }

  client.close();
  console.log('✅ All auth tests completed!');
}

// Executar testes
testAuth().catch(console.error);

