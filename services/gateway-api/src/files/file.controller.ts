import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
  Query,
  StreamableFile,
  Res,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileService } from './file.service';
import { FileUploadResponseDto, FileMetadataDto } from './dto/upload.dto';
import { Response } from 'express';

// Define o decorator CurrentUser
export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FileController {
  private readonly logger = new Logger(FileController.name);

  constructor(private fileService: FileService) {}

  /**
   * Upload de arquivo para uma mensagem
   * POST /files/upload?conversationId=<id>&messageId=<id>
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: any,
    @Query('conversationId') conversationId: string,
    @Query('messageId') messageId: string,
    @Query('description') description?: string,
    @CurrentUser() user?: { id: string },
  ): Promise<FileUploadResponseDto> {
    this.logger.log(`[uploadFile] Novo upload - conversationId: ${conversationId}, messageId: ${messageId}, user: ${user?.id}`);

    if (!file) {
      this.logger.error(`[uploadFile] Arquivo não fornecido`);
      throw new BadRequestException('No file provided');
    }

    if (!conversationId || !messageId) {
      this.logger.error(`[uploadFile] Query parameters inválidos - conversationId: ${conversationId}, messageId: ${messageId}`);
      throw new BadRequestException('conversationId and messageId query parameters are required');
    }

    try {
      const fileMetadata = await this.fileService.uploadFile(
        conversationId,
        messageId,
        user?.id,
        file.originalname,
        file.size,
        file.mimetype,
        file.buffer,
        description,
      );

      this.logger.log(`[uploadFile] Upload concluído - fileId: ${fileMetadata.fileId}`);

      return {
        success: true,
        messageId,
        fileName: fileMetadata.fileName,
        fileUrl: fileMetadata.url,
        fileSize: fileMetadata.fileSize,
        mimeType: fileMetadata.mimeType,
        uploadedAt: fileMetadata.uploadedAt,
      };
    } catch (error) {
      this.logger.error(`[uploadFile] Erro no upload - error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtém metadados de um arquivo
   * GET /files/:fileId
   */
  @Get(':fileId')
  async getFile(@Param('fileId') fileId: string): Promise<FileMetadataDto> {
    this.logger.debug(`[getFile] Obtendo metadados - fileId: ${fileId}`);

    return this.fileService.getFileMetadata(fileId);
  }

  /**
   * Lista arquivos de uma conversa
   * GET /files/conversation/:conversationId
   */
  @Get('conversation/:conversationId')
  async listConversationFiles(@Param('conversationId') conversationId: string): Promise<FileMetadataDto[]> {
    this.logger.debug(`[listConversationFiles] Listando arquivos - conversationId: ${conversationId}`);

    return this.fileService.listConversationFiles(conversationId);
  }

  /**
   * Lista arquivos de uma mensagem
   * GET /files/message/:messageId
   */
  @Get('message/:messageId')
  async listMessageFiles(@Param('messageId') messageId: string): Promise<FileMetadataDto[]> {
    this.logger.debug(`[listMessageFiles] Listando arquivos de mensagem - messageId: ${messageId}`);

    return this.fileService.listMessageFiles(messageId);
  }

  /**
   * Deleta um arquivo
   * DELETE /files/:fileId
   */
  @Delete(':fileId')
  async deleteFile(
    @Param('fileId') fileId: string,
    @CurrentUser() user?: { id: string },
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`[deleteFile] Deletando arquivo - fileId: ${fileId}, user: ${user?.id}`);

    await this.fileService.deleteFile(fileId, user?.id);

    this.logger.log(`[deleteFile] Arquivo deletado com sucesso - fileId: ${fileId}`);

    return {
      success: true,
      message: `File ${fileId} deleted successfully`,
    };
  }

  /**
   * Obtém URL de download de um arquivo
   * GET /files/:fileId/download-url
   */
  @Get(':fileId/download-url')
  async getDownloadUrl(@Param('fileId') fileId: string): Promise<{ fileId: string; url: string }> {
    this.logger.debug(`[getDownloadUrl] Gerando URL de download - fileId: ${fileId}`);

    const url = await this.fileService.getDownloadUrl(fileId);

    return {
      fileId,
      url,
    };
  }

  /**
   * Faz download de um arquivo
   * GET /files/storage/*
   */
  @Get('storage/*')
  async downloadFile(
    @Param() params: any,
    @Res() res: Response,
  ): Promise<any> {
    try {
      // Extrair o caminho do arquivo
      const storagePath = params[0] || '';
      this.logger.debug(`[downloadFile] Baixando arquivo - storagePath: ${storagePath}`);

      // Obter arquivo do storage
      const fileBuffer = this.fileService.getFileFromStorage(storagePath);

      if (!fileBuffer) {
        this.logger.error(`[downloadFile] Arquivo não encontrado - storagePath: ${storagePath}`);
        return res.status(404).json({ error: 'File not found' });
      }

      // Obter metadados para o MIME type
      const fileName = storagePath.split('/').pop() || 'file';
      
      // Enviar arquivo
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(fileBuffer);
    } catch (error) {
      this.logger.error(`[downloadFile] Erro ao baixar arquivo - error: ${error.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}
