import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Scope,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { tap, switchMap, catchError } from 'rxjs/operators';
import { PgService } from './pg.service';

@Injectable({ scope: Scope.REQUEST })
export class PgCleanupInterceptor implements NestInterceptor {
  constructor(private readonly pgService: PgService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      switchMap(async (data) => {
        await this.pgService.disconnect();
        return data;
      }),
      catchError(async (error) => {
        await this.pgService.disconnect();
        throw error;
      }),
    );
  }
}
