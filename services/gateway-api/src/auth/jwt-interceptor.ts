import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Interceptor para extrair informações do JWT e adicionar ao contexto
 * Isso permite que os controllers acessem o userId do token
 */
@Injectable()
export class JwtInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Para gRPC, extrair user do request
    if (context.getType() === 'rpc') {
      const ctx = context.switchToRpc().getContext();
      const request = context.switchToHttp().getRequest();
      
      // Se o Passport já validou o token, o user estará no request
      if (request?.user) {
        ctx.user = request.user;
      }
    }

    return next.handle().pipe(
      tap(() => {
        // Qualquer lógica adicional após a execução
      }),
    );
  }
}

