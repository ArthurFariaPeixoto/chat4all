import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { AuthService } from './auth.service';

// Interfaces para tipagem dos dados gRPC
interface RefreshTokenRequest {
  refresh_token?: string;
  refreshToken?: string; // Suporte para camelCase também
}

// DTOs para REST API
interface RegisterDto {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

interface LoginDto {
  email: string;
  password: string;
}

interface RefreshDto {
  refreshToken: string;
}

@Controller()
export class AuthController {
  constructor(private authService: AuthService) {}

  // ============ REST API Endpoints ============
  
  @Post('auth/register')
  async registerUserRest(@Body() dto: RegisterDto) {
    try {
      const result = await this.authService.registerUser(
        dto.username,
        dto.email,
        dto.password,
        dto.displayName,
      );
      
      return {
        id: result.user_id,
        username: result.username,
        email: result.email,
        displayName: result.display_name,
        createdAt: result.created_at,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao registrar usuário',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('auth/login')
  async loginRest(@Body() dto: LoginDto) {
    try {
      const result = await this.authService.getToken(
        'default-client',
        'default-secret',
        'password',
        dto.email,
        dto.password,
      );
      
      // Decodificar o token para obter informações do usuário
      const decoded: any = this.authService['jwtService'].decode(result.access_token);
      
      return {
        accessToken: result.access_token,
        tokenType: result.token_type,
        expiresIn: result.expires_in,
        refreshToken: result.refresh_token,
        user: {
          id: decoded.sub || decoded.user_id,
          username: decoded.username,
          email: decoded.email,
        },
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Credenciais inválidas',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  @Post('auth/refresh')
  async refreshTokenRest(@Body() dto: RefreshDto) {
    try {
      const result = await this.authService.refreshToken(dto.refreshToken);
      
      return {
        accessToken: result.access_token,
        expiresIn: result.expires_in,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Token inválido',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  // ============ gRPC Endpoints ============

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
      console.error('Error in GetToken controller:', error);
      console.error('Error type:', error?.constructor?.name);
      console.error('Is RpcException?', error instanceof RpcException);
      console.error('Error code:', error?.code);
      console.error('Error message:', error?.message);
      
      // Se já é um RpcException, propagar diretamente
      if (error instanceof RpcException) {
        console.log('Propagando RpcException');
        throw error;
      }
      // Para outros erros, converter para RpcException
      console.log('Convertendo erro para RpcException');
      throw new RpcException({
        status: 13, // INTERNAL
        message: error.message || 'Erro interno ao processar requisição',
      });
    }
  }

  @GrpcMethod('AuthService', 'RefreshToken')
  async refreshToken(data: RefreshTokenRequest) {
    console.log('RefreshToken received data:', JSON.stringify(data, null, 2));
    
    try {
      // Tentar ambos os formatos (snake_case e camelCase) - gRPC pode enviar em qualquer formato
      const refreshToken = data.refresh_token || data.refreshToken;

        if (!refreshToken) {
            throw new RpcException({
                code: 3, // INVALID_ARGUMENT
                message: 'refresh_token é obrigatório',
            });
        }

      const result = await this.authService.refreshToken(refreshToken);
      
      console.log('Returning result from RefreshToken controller:', JSON.stringify(result, null, 2));
      
      // Garantir que os campos estejam em snake_case conforme o proto
      return {
        access_token: result.access_token,
        expires_in: result.expires_in,
      };
    } catch (error) {
      console.error('Error in RefreshToken:', error);
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

  @GrpcMethod('AuthService', 'RevokeToken')
  async revokeToken(data: { token: string }) {
    return this.authService.revokeToken(data.token);
  }

  @GrpcMethod('AuthService', 'ValidateToken')
  async validateToken(data: { token: string }) {
    return this.authService.validateToken(data.token);
  }
}

