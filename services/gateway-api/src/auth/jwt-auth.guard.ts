import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Para gRPC, extrair token do metadata e validar manualmente
    if (context.getType() === 'rpc') {
      try {
        const metadata = context.switchToRpc().getContext();
        console.log('JwtAuthGuard - Tipo de contexto: rpc');
        console.log('JwtAuthGuard - Metadata keys:', metadata ? Object.keys(metadata) : 'metadata é null');
        
        const authHeader = metadata?.get('authorization');
        console.log('JwtAuthGuard - authHeader:', authHeader);
        
        if (!authHeader || authHeader.length === 0) {
          console.error('JwtAuthGuard - Token não fornecido no metadata');
          throw new UnauthorizedException('Token não fornecido');
        }

        const token = authHeader[0]?.replace('Bearer ', '') || authHeader[0];
        
        if (!token) {
          console.error('JwtAuthGuard - Token vazio após processamento');
          throw new UnauthorizedException('Token não fornecido');
        }

        console.log('JwtAuthGuard - Validando token...');
        
        // Validar token manualmente
        const secret = this.configService.get<string>('JWT_SECRET');
        const payload = this.jwtService.verify(token, { secret });
        
        console.log('JwtAuthGuard - Token válido, userId:', payload.sub);
        
        // Adicionar user ao contexto gRPC
        const rpcContext = context.switchToRpc().getContext();
        rpcContext.user = {
          userId: payload.sub,
          type: payload.type,
        };
        
        console.log('JwtAuthGuard - User adicionado ao contexto:', rpcContext.user);

        return true;
      } catch (error) {
        console.error('JwtAuthGuard - Erro na validação:', error);
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new UnauthorizedException('Token inválido: ' + error.message);
      }
    }

    // Para HTTP, usar o comportamento padrão do Passport
    return super.canActivate(context);
  }
}

