import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProviderFactory } from './provider.factory';
import { ProviderService } from './provider.service';

@Module({
  imports: [PrismaModule],
  providers: [ProviderFactory, ProviderService],
  exports: [ProviderService],
})
export class ProvidersModule {}
