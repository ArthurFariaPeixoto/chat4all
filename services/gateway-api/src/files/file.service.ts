import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MongoDBService } from '../mongodb/mongodb.service';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Client as MinioClient } from 'minio';
import { FileMetadataDto } from './dto/upload.dto';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
  private readonly BUCKET_NAME = 'chat4all-files';
  private readonly STORAGE_PATH = process.env.FILE_STORAGE_PATH || '/tmp/chat4all-files';
  private readonly ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'audio/mpeg',
    'audio/wav',
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
  ];

  constructor(
    private prismaService: PrismaService,
    private mongoDBService: MongoDBService,
  ) {
    this.initStorage();
  }

  private minio: MinioClient | null = null;
  private usingObjectStorage = false;

  private initStorage() {
    const endpoint = process.env.MINIO_ENDPOINT;
    if (endpoint) {
      this.logger.log(`[FileService] Inicializando MinIO/S3 endpoint=${endpoint}`);
      this.minio = new MinioClient({
        endPoint: endpoint,
        port: Number(process.env.MINIO_PORT || 9000),
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
        secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
      });
      this.usingObjectStorage = true;
      // Ensure bucket exists (best effort)
      this.minio.bucketExists(this.BUCKET_NAME).catch(async () => {
        await this.minio!.makeBucket(this.BUCKET_NAME, 'us-east-1');
        this.logger.log(`[FileService] Bucket criado: ${this.BUCKET_NAME}`);
      }).catch((err) => this.logger.warn(`[FileService] Falha ao criar bucket: ${err.message}`));
      return;
    }

    // Fallback para filesystem local
    try {
      if (!fs.existsSync(this.STORAGE_PATH)) {
        fs.mkdirSync(this.STORAGE_PATH, { recursive: true });
        this.logger.log(`[FileService] Diretório de armazenamento criado: ${this.STORAGE_PATH}`);
      }
    } catch (error) {
      this.logger.warn(`[FileService] Erro ao criar diretório de armazenamento: ${error.message}`);
    }
  }

  /**
   * Valida o arquivo antes do upload
   */
  validateFile(fileName: string, fileSize: number, mimeType: string): void {
    this.logger.debug(`[validateFile] Validando arquivo - fileName: ${fileName}, fileSize: ${fileSize}, mimeType: ${mimeType}`);

    // Validar tamanho
    if (fileSize > this.MAX_FILE_SIZE) {
      this.logger.error(`[validateFile] Arquivo excede tamanho máximo - fileSize: ${fileSize}MB, max: ${this.MAX_FILE_SIZE / (1024 * 1024)}MB`);
      throw new BadRequestException(`File size exceeds 2GB limit. Received: ${fileSize / (1024 * 1024 * 1024)}GB`);
    }

    // Validar MIME type
    if (!this.ALLOWED_MIME_TYPES.includes(mimeType)) {
      this.logger.error(`[validateFile] MIME type não permitido - mimeType: ${mimeType}`);
      throw new BadRequestException(`File type not allowed. Allowed types: ${this.ALLOWED_MIME_TYPES.join(', ')}`);
    }

    // Validar nome do arquivo
    if (!fileName || fileName.trim().length === 0) {
      this.logger.error(`[validateFile] Nome do arquivo inválido`);
      throw new BadRequestException('File name cannot be empty');
    }

    if (fileName.length > 255) {
      this.logger.error(`[validateFile] Nome do arquivo muito longo - length: ${fileName.length}`);
      throw new BadRequestException('File name too long (max 255 characters)');
    }

    this.logger.debug(`[validateFile] Arquivo validado com sucesso`);
  }

  /**
   * Realiza upload do arquivo para MinIO
   */
  async uploadFile(
    conversationId: string,
    messageId: string,
    userId: string,
    fileName: string,
    fileSize: number,
    mimeType: string,
    fileBuffer: Buffer,
    description?: string,
  ): Promise<FileMetadataDto> {
    this.logger.log(`[uploadFile] Iniciando upload - conversationId: ${conversationId}, messageId: ${messageId}, fileName: ${fileName}`);

    try {
      // Validar arquivo
      this.validateFile(fileName, fileSize, mimeType);

      // Validar conversa existe
      const conversation = await this.prismaService.conversation.findUnique({
        where: { id: conversationId },
      });

      if (!conversation) {
        this.logger.error(`[uploadFile] Conversa não encontrada - conversationId: ${conversationId}`);
        throw new NotFoundException('Conversation not found');
      }

      // Gerar nome único no storage (evita conflitos)
      const fileId = crypto.randomUUID();
      const storagePath = `${conversationId}/${messageId}/${fileId}/${fileName}`;
      let fileUrl = '';

      if (this.usingObjectStorage && this.minio) {
        await this.minio.putObject(this.BUCKET_NAME, storagePath, fileBuffer, fileSize, {
          'Content-Type': mimeType,
        });
        fileUrl = `${process.env.MINIO_PUBLIC_URL || ''}/${this.BUCKET_NAME}/${storagePath}`;
        this.logger.log(`[uploadFile] Arquivo salvo no objeto storage - ${fileUrl}`);
      } else {
        const fullPath = path.join(this.STORAGE_PATH, storagePath);

        // Criar diretório se não existir
        const dirPath = path.dirname(fullPath);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
          this.logger.debug(`[uploadFile] Diretório criado - path: ${dirPath}`);
        }

        // Salvar arquivo localmente
        this.logger.debug(`[uploadFile] Salvando arquivo localmente - path: ${fullPath}`);
        fs.writeFileSync(fullPath, fileBuffer);

        // Gerar URL de acesso local
        fileUrl = `/files/storage/${storagePath}`;
        this.logger.log(`[uploadFile] Arquivo salvo com sucesso - fileUrl: ${fileUrl}`);
      }

      // Salvar metadados no MongoDB
      const fileMetadata = {
        fileId,
        fileName,
        fileSize,
        mimeType,
        uploadedAt: new Date(),
        uploadedBy: userId,
        conversationId,
        messageId,
        description: description || '',
        storagePath,
        url: fileUrl,
      };

      this.logger.debug(`[uploadFile] Salvando metadados no MongoDB`);
      await this.mongoDBService.insertOne('file_metadata', fileMetadata);

      this.logger.log(`[uploadFile] Upload concluído com sucesso - fileId: ${fileId}`);

      return fileMetadata;
    } catch (error) {
      this.logger.error(`[uploadFile] Erro durante upload - error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtém metadados de um arquivo
   */
  async getFileMetadata(fileId: string): Promise<FileMetadataDto> {
    this.logger.debug(`[getFileMetadata] Buscando metadados - fileId: ${fileId}`);

    const metadata = await this.mongoDBService.findOne('file_metadata', { fileId });

    if (!metadata) {
      this.logger.error(`[getFileMetadata] Arquivo não encontrado - fileId: ${fileId}`);
      throw new NotFoundException('File not found');
    }

    this.logger.debug(`[getFileMetadata] Metadados encontrados - fileId: ${fileId}`);
    return metadata;
  }

  /**
   * Lista arquivos de uma conversa
   */
  async listConversationFiles(conversationId: string): Promise<FileMetadataDto[]> {
    this.logger.debug(`[listConversationFiles] Listando arquivos - conversationId: ${conversationId}`);

    const files = await this.mongoDBService.find('file_metadata', { conversationId });

    this.logger.debug(`[listConversationFiles] Encontrados ${files.length} arquivos - conversationId: ${conversationId}`);
    return files;
  }

  /**
   * Lista arquivos de uma mensagem
   */
  async listMessageFiles(messageId: string): Promise<FileMetadataDto[]> {
    this.logger.debug(`[listMessageFiles] Listando arquivos de mensagem - messageId: ${messageId}`);

    const files = await this.mongoDBService.find('file_metadata', { messageId });

    this.logger.debug(`[listMessageFiles] Encontrados ${files.length} arquivos - messageId: ${messageId}`);
    return files;
  }

  /**
   * Deleta um arquivo
   */
  async deleteFile(fileId: string, userId: string): Promise<void> {
    this.logger.log(`[deleteFile] Iniciando deleção - fileId: ${fileId}, userId: ${userId}`);

    try {
      const metadata = await this.getFileMetadata(fileId);

      // Verificar permissão (apenas o uploader ou admin pode deletar)
      if (metadata.uploadedBy !== userId) {
        this.logger.error(`[deleteFile] Usuário não autorizado - fileId: ${fileId}, userId: ${userId}`);
        throw new BadRequestException('You are not authorized to delete this file');
      }

      // Deletar arquivo local
      const fullPath = path.join(this.STORAGE_PATH, metadata.storagePath);
      if (fs.existsSync(fullPath)) {
        this.logger.debug(`[deleteFile] Deletando arquivo local - path: ${fullPath}`);
        fs.unlinkSync(fullPath);
      }

      // Deletar metadados do MongoDB
      this.logger.debug(`[deleteFile] Deletando metadados do MongoDB - fileId: ${fileId}`);
      await this.mongoDBService.deleteOne('file_metadata', { fileId });

      this.logger.log(`[deleteFile] Arquivo deletado com sucesso - fileId: ${fileId}`);
    } catch (error) {
      this.logger.error(`[deleteFile] Erro durante deleção - fileId: ${fileId}, error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtém URL de download de um arquivo
   */
  async getDownloadUrl(fileId: string): Promise<string> {
    this.logger.debug(`[getDownloadUrl] Gerando URL de download - fileId: ${fileId}`);

    const metadata = await this.getFileMetadata(fileId);

    this.logger.debug(`[getDownloadUrl] URL gerada - fileId: ${fileId}`);
    return metadata.url;
  }

  /**
   * Obtém arquivo do storage local
   */
  getFileFromStorage(storagePath: string): Buffer | null {
    try {
      const fullPath = path.join(this.STORAGE_PATH, storagePath);

      if (!fs.existsSync(fullPath)) {
        this.logger.warn(`[getFileFromStorage] Arquivo não encontrado - path: ${fullPath}`);
        return null;
      }

      return fs.readFileSync(fullPath);
    } catch (error) {
      this.logger.error(`[getFileFromStorage] Erro ao ler arquivo - error: ${error.message}`);
      return null;
    }
  }
}
