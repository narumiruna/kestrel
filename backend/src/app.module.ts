import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LibraryModule } from './library/library.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SyncModule } from './sync/sync.module';
import { SharingModule } from './sharing/sharing.module';
import { RemoteControlModule } from './remote-control/remote-control.module';
import { AccountSecurityModule } from './account-security/account-security.module';
import { HttpRequestLoggingMiddleware } from './http-request-logging.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AccountSecurityModule,
    LibraryModule,
    SyncModule,
    SharingModule,
    RemoteControlModule,
  ],
  controllers: [AppController],
  providers: [AppService, HttpRequestLoggingMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(HttpRequestLoggingMiddleware)
      .forRoutes({ method: RequestMethod.ALL, path: '{*splat}' });
  }
}
