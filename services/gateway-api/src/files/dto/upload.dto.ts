import { IsString, IsUUID, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class UploadFileDto {
  @IsUUID()
  conversationId: string;

  @IsString()
  messageId: string;

  @IsString()
  fileName: string;

  @IsString()
  mimeType: string;

  @IsNumber()
  @Min(1)
  @Max(2 * 1024 * 1024 * 1024) // 2GB
  fileSize: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class FileUploadResponseDto {
  success: boolean;
  messageId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
}

export class FileMetadataDto {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
  uploadedBy: string;
  conversationId: string;
  messageId: string;
  description?: string;
  storagePath?: string;
  url: string;
}
