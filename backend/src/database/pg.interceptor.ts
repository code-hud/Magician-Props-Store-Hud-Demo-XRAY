import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, finalize } from 'rxjs/operators';
import { PgService } from './pg.service';

@Injectable()
export class PgCleanupInterceptor implements NestInterceptor {
  constructor(private readonly pgService: PgService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      finalize(async () => {
        // Disconnect the client after the request completes (success or error)
        if (this.pgService) {
          await this.pgService.disconnect();
        }
      }),
    );
  }
}
