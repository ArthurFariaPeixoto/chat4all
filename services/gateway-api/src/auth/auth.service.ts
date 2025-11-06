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
   * Gera token de acesso e refresh token
   */
  async getToken(
    clientId: string,
    clientSecret: string,
    grantType: string,
    username?: string,
    password?: string,
  ) {
    console.log('getToken called with:', { clientId, grantType, hasUsername: !!username });
    
    // Validação básica de grant_type
    if (!grantType || (grantType !== 'client_credentials' && grantType !== 'password')) {
      console.error('Invalid grant_type received:', grantType, 'Type:', typeof grantType);
      throw new RpcException({
        code: 16, // UNAUTHENTICATED
        message: `Invalid grant_type: ${grantType || 'undefined'}`,
      });
    }

    let userId: string;

    console.log('Processing grant_type:', grantType);
    
    if (grantType === 'client_credentials') {
      // Para client_credentials, usar client_id como user_id
      // Em produção, validar client_id e client_secret contra uma tabela de clients
      userId = clientId;
      console.log('Using clientId as userId:', userId);
    } else if (grantType === 'password') {
      // Para password, validar username e password
      if (!username || !password) {
        throw new UnauthorizedException('Username and password required for password grant');
      }

      // Buscar usuário no banco
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { username },
            { email: username },
          ],
        },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Validar senha (em produção, senha deve estar hasheada)
      // Por enquanto, aceita qualquer senha se o usuário existir
      // TODO: Implementar hash de senha quando schema Prisma estiver completo
      userId = user.id;
    } else {
      throw new UnauthorizedException('Invalid grant_type');
    }

    // Gerar tokens
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
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      // Gerar novo access token
      const accessToken = await this.generateAccessToken(payload.sub);

      const expiresIn = this.configService.get<string>('JWT_EXPIRATION', '15m');
      const expiresInSeconds = this.parseExpiration(expiresIn);

      return {
        access_token: accessToken,
        expires_in: expiresInSeconds,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
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

