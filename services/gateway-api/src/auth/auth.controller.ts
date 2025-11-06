import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private authService: AuthService) {}

  @GrpcMethod('AuthService', 'RegisterUser')
  async registerUser(data: any) {
    console.log('RegisterUser received data:', JSON.stringify(data, null, 2));
    
    try {
      // Tentar ambos os formatos (snake_case e camelCase)
      const username = data.username;
      const email = data.email;
      const password = data.password;
      const displayName = data.display_name || data.displayName;

      const result = await this.authService.registerUser(
        username,
        email,
        password,
        displayName,
      );

      console.log('Returning result from RegisterUser controller:', JSON.stringify(result, null, 2));

      // Garantir que os campos estejam em snake_case conforme o proto
      return {
        user_id: result.user_id,
        username: result.username,
        email: result.email,
        display_name: result.display_name,
        created_at: result.created_at,
      };
    } catch (error) {
      console.error('Error in RegisterUser:', error);
      // Se já é um RpcException, propagar diretamente
      if (error instanceof RpcException) {
        throw error;
      }
      // Para outros erros, converter para RpcException
      throw new RpcException({
        code: 13, // INTERNAL
        message: error.message || 'Erro interno ao processar requisição',
      });
    }
  }

  @GrpcMethod('AuthService', 'GetToken')
  async getToken(data: any) {
    console.log('GetToken received data:', JSON.stringify(data, null, 2));
    console.log('Data keys:', Object.keys(data));
    console.log('grant_type value:', data.grant_type, data.grantType, data['grant_type']);
    
    try {
      // Tentar ambos os formatos (snake_case e camelCase)
      const grantType = data.grant_type || data.grantType;
      const clientId = data.client_id || data.clientId;
      const clientSecret = data.client_secret || data.clientSecret;
      
      const result = await this.authService.getToken(
        clientId,
        clientSecret,
        grantType,
        data.username,
        data.password,
      );
      
      console.log('Returning result from controller:', JSON.stringify(result, null, 2));
      
      // Garantir que os campos estejam em snake_case conforme o proto
      return {
        access_token: result.access_token,
        token_type: result.token_type,
        expires_in: result.expires_in,
        refresh_token: result.refresh_token,
      };
    } catch (error) {
      console.error('Error in GetToken:', error);
      throw error;
    }
  }

  @GrpcMethod('AuthService', 'RefreshToken')
  async refreshToken(data: { refresh_token: string }) {
    return this.authService.refreshToken(data.refresh_token);
  }

  @GrpcMethod('AuthService', 'RevokeToken')
  async revokeToken(data: { token: string }) {
    return this.authService.revokeToken(data.token);
  }

  @GrpcMethod('AuthService', 'ValidateToken')
  async validateToken(data: { token: string }) {
    return this.authService.validateToken(data.token);
  }
}

