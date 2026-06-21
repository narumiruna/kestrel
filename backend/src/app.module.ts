import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LibraryModule } from './library/library.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SyncModule } from './sync/sync.module';
import { SharingModule } from './sharing/sharing.module';
import { RemoteControlModule } from './remote-control/remote-control.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    LibraryModule,
    SyncModule,
    SharingModule,
    RemoteControlModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
