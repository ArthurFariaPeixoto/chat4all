import { Injectable, UnauthorizedException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  /**
   * Registra um novo usuário
   */
  async registerUser(
    username: string,
    email?: string,
    password?: string,
    displayName?: string,
  ) {
      // Validações
    if (!username || username.trim().length < 3) {
      throw new RpcException({
        status: 3, // INVALID_ARGUMENT
        message: 'Username deve ter no mínimo 3 caracteres',
      });
    }

    if (!password || password.length < 8) {
      throw new RpcException({
        status: 3, // INVALID_ARGUMENT
        message: 'Password deve ter no mínimo 8 caracteres',
      });
    }

    // Validar formato de email se fornecido
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new RpcException({
        status: 3, // INVALID_ARGUMENT
        message: 'Email inválido',
      });
    }

    // Verificar se username já existe
    const existingUserByUsername = await this.prisma.user.findUnique({
      where: { username },
    });

    if (existingUserByUsername) {
      throw new RpcException({
        status: 6, // ALREADY_EXISTS
        message: 'Username já está em uso',
      });
    }

    // Verificar se email já existe (se fornecido)
    if (email) {
      const existingUserByEmail = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingUserByEmail) {
        throw new RpcException({
          status: 6, // ALREADY_EXISTS
          message: 'Email já está em uso',
        });
      }
    }

    // Hash da senha
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Criar usuário
    try {
      const user = await this.prisma.user.create({
        data: {
          username: username.trim(),
          email: email?.trim() || null,
          password: hashedPassword,
          displayName: displayName?.trim() || null,
        } as any,
      });

      return {
        user_id: user.id,
        username: user.username,
        email: user.email || undefined,
        display_name: user.displayName || undefined,
        created_at: Math.floor(user.createdAt.getTime() / 1000),
      };
    } catch (error) {
      // Tratar erros de constraint do banco
      if (error.code === 'P2002') {
        // Unique constraint violation
        const field = error.meta?.target?.[0];
        throw new RpcException({
          status: 6, // ALREADY_EXISTS
          message: `${field} já está em uso`,
        });
      }
      throw new RpcException({
        status: 13, // INTERNAL
        message: 'Erro ao criar usuário',
      });
    }
  }

  /**
   * Gera token de acesso e refresh token
   * Valida username/password contra a tabela user
   */
  async getToken(
    clientId: string,
    clientSecret: string,
    grantType: string,
    username?: string,
    password?: string,
  ) {
    console.log('getToken called with:', { clientId, grantType, hasUsername: !!username });
    
    // Validação de grant_type - apenas "password" é suportado
    if (!grantType) {
      throw new RpcException({
        status: 3, // INVALID_ARGUMENT
        message: 'grant_type é obrigatório',
      });
    }

    if (grantType !== 'password') {
      throw new RpcException({
        status: 3, // INVALID_ARGUMENT
        message: `grant_type deve ser "password". Recebido: ${grantType}`,
      });
    }

    // Validação de campos obrigatórios para grant_type "password"
    if (!username || username.trim().length === 0) {
      throw new RpcException({
        status: 3, // INVALID_ARGUMENT
        message: 'username é obrigatório para grant_type "password"',
      });
    }

    if (!password || password.length === 0) {
      throw new RpcException({
        status: 3, // INVALID_ARGUMENT
        message: 'password é obrigatório para grant_type "password"',
      });
    }

    // Buscar usuário no banco por username ou email
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: username.trim() },
          { email: username.trim() },
        ],
      },
      select: {
        id: true,
        username: true,
        email: true,
        password: true,
      } as any,
    });

    // Se usuário não encontrado, retornar erro de autenticação
    if (!user) {
      throw new RpcException({
        status: 16, // UNAUTHENTICATED
        message: 'Credenciais inválidas',
      });
    }

      // Validar senha usando bcrypt
    const userPassword = (user as any).password;
    if (!userPassword) {
      throw new RpcException({
        status: 16, // UNAUTHENTICATED
        message: 'Credenciais inválidas',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, userPassword);
    if (!isPasswordValid) {
      throw new RpcException({
        status: 16, // UNAUTHENTICATED
        message: 'Credenciais inválidas',
      });
    }

    // Se chegou aqui, credenciais são válidas - gerar tokens
    const userId = String(user.id);
    console.log('About to generate tokens for userId:', userId);
    const accessToken = await this.generateAccessToken(userId);
    console.log('Access token generated, length:', accessToken?.length);
    const refreshToken = await this.generateRefreshToken(userId);
    console.log('Refresh token generated, length:', refreshToken?.length);

    const expiresIn = this.configService.get<string>('JWT_EXPIRATION', '15m');
    const expiresInSeconds = this.parseExpiration(expiresIn);

    // Garantir que os tipos estejam corretos conforme o proto
    const response = {
      access_token: String(accessToken || ''),
      token_type: String('Bearer'),
      expires_in: Number(expiresInSeconds || 0),
      refresh_token: refreshToken ? String(refreshToken) : undefined,
    };
    
    console.log('Generated tokens response:', { 
      hasAccessToken: !!accessToken, 
      hasRefreshToken: !!refreshToken,
      expiresIn: expiresInSeconds,
      responseTypes: {
        access_token: typeof response.access_token,
        token_type: typeof response.token_type,
        expires_in: typeof response.expires_in,
        refresh_token: typeof response.refresh_token,
      }
    });

    return response;
  }

  /**
   * Renova access token usando refresh token
   */
  async refreshToken(refreshToken: string) {
    if (!refreshToken) {
      throw new RpcException({
        status: 16, // UNAUTHENTICATED
        message: 'refresh_token is required',
      });
    }

    try {
      const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
      if (!refreshSecret) {
        throw new RpcException({
          status: 13, // INTERNAL
          message: 'JWT_REFRESH_SECRET is not configured',
        });
      }

      const payload = this.jwtService.verify(refreshToken, {
        secret: refreshSecret,
      });

      // Verificar se é um refresh token (não um access token)
      if (payload.type !== 'refresh') {
        throw new RpcException({
          status: 16, // UNAUTHENTICATED
          message: 'Invalid token type. Expected refresh token.',
        });
      }

      // Gerar novo access token
      const accessToken = await this.generateAccessToken(payload.sub);

      const expiresIn = this.configService.get<string>('JWT_EXPIRATION', '15m');
      const expiresInSeconds = this.parseExpiration(expiresIn);

      return {
        access_token: accessToken,
        expires_in: expiresInSeconds,
      };
    } catch (error) {
      // Se já é um RpcException, re-lançar
      if (error instanceof RpcException) {
        throw error;
      }
      
      // Para outros erros (JWT inválido, expirado, etc)
      throw new RpcException({
        status: 16, // UNAUTHENTICATED
        message: error.message || 'Invalid refresh token',
      });
    }
  }

  /**
   * Revoga um token (adiciona à blacklist)
   * Por enquanto, apenas valida o token
   * TODO: Implementar blacklist em Redis quando necessário
   */
  async revokeToken(token: string) {
    try {
      // Validar token
      this.jwtService.verify(token);
      // Em produção, adicionar à blacklist (Redis)
      return { success: true };
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Valida um token e retorna informações
   */
  async validateToken(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      return {
        valid: true,
        user_id: payload.sub,
        expires_at: payload.exp * 1000, // Converter para milissegundos
      };
    } catch (error) {
      return {
        valid: false,
        user_id: undefined,
        expires_at: undefined,
      };
    }
  }

  /**
   * Gera access token
   */
  private async generateAccessToken(userId: string): Promise<string> {
    const payload = { sub: userId, type: 'access' };
    const token = await this.jwtService.signAsync(payload);
    console.log('Generated access token:', token ? 'Token generated' : 'Token is empty', 'Length:', token?.length);
    return token;
  }

  /**
   * Gera refresh token
   */
  private async generateRefreshToken(userId: string): Promise<string> {
    const payload = { sub: userId, type: 'refresh' };
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    const refreshExpiration = this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d');

    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }

    // @ts-expect-error - expiresIn accepts string like "7d" but TypeScript types are strict
    return this.jwtService.signAsync(payload, {
      secret: refreshSecret,
      expiresIn: refreshExpiration,
    });
  }

  /**
   * Converte string de expiração (ex: "15m", "1h") para segundos
   */
  private parseExpiration(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 900; // Default 15 minutos
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };

    return value * (multipliers[unit] || 60);
  }
}

