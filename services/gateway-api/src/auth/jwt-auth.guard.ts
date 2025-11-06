import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Para gRPC, extrair token do metadata
    if (context.getType() === 'rpc') {
      const metadata = context.switchToRpc().getContext();
      const token = metadata.get('authorization')?.[0]?.replace('Bearer ', '');
      
      if (token) {
        // Adicionar token ao request para o Passport
        const request = context.switchToHttp().getRequest();
        if (request) {
          request.headers = request.headers || {};
          request.headers.authorization = `Bearer ${token}`;
        }
      }
    }

    return super.canActivate(context);
  }
}

