import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [LibraryController],
  providers: [LibraryService],
})
export class LibraryModule {}
