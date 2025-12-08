import { Module } from '@nestjs/common';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { PrismaService } from '../prisma/prisma.service';
import { MongoDBService } from '../mongodb/mongodb.service';

// MinIO service será instanciado dinamicamente
@Module({
  imports: [],
  controllers: [FileController],
  providers: [FileService, PrismaService, MongoDBService],
  exports: [FileService],
})
export class FilesModule {}
