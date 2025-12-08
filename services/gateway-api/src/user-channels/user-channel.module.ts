import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UserChannelService } from './user-channel.service';
import { UserChannelController } from './user-channel.controller';

@Module({
  imports: [PrismaModule],
  providers: [UserChannelService],
  controllers: [UserChannelController],
  exports: [UserChannelService],
})
export class UserChannelModule {}
