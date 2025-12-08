import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserChannelDto } from './dto/create-user-channel.dto';
import { UpdateUserChannelDto } from './dto/update-user-channel.dto';

@Injectable()
export class UserChannelService {
  private readonly logger = new Logger(UserChannelService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Cria um novo canal para o usuário
   */
  async createUserChannel(userId: string, createDto: CreateUserChannelDto) {
    this.logger.log(`[createUserChannel] Criando canal - userId: ${userId}, channel: ${createDto.channelName}`);

    try {
      // Validar que o canal não existe para este usuário
      const existing = await this.prisma.userChannel.findUnique({
        where: {
          userId_channelName_channelUserId: {
            userId,
            channelName: createDto.channelName,
            channelUserId: createDto.channelUserId,
          },
        },
      });

      if (existing) {
        this.logger.warn(`[createUserChannel] Canal já existe - userId: ${userId}, channel: ${createDto.channelName}`);
        throw new ConflictException('User channel already exists for this channel and user ID');
      }

      // Validar usuário existe
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        this.logger.error(`[createUserChannel] Usuário não encontrado - userId: ${userId}`);
        throw new NotFoundException('User not found');
      }

      // Validar channelName
      const validChannels = ['whatsapp', 'instagram', 'telegram', 'messenger', 'sms'];
      if (!validChannels.includes(createDto.channelName.toLowerCase())) {
        this.logger.warn(`[createUserChannel] Canal inválido - channel: ${createDto.channelName}`);
        throw new BadRequestException(`Invalid channel. Valid channels: ${validChannels.join(', ')}`);
      }

      // Criar canal
      const userChannel = await this.prisma.userChannel.create({
        data: {
          userId,
          channelName: createDto.channelName.toLowerCase(),
          channelUserId: createDto.channelUserId,
          displayName: createDto.displayName,
          credentials: createDto.credentials,
          isActive: createDto.isActive ?? true,
          metadata: createDto.metadata,
          webhookSecret: this.generateSecret(),
        },
      });

      this.logger.log(`[createUserChannel] Canal criado com sucesso - channelId: ${userChannel.id}`);
      return userChannel;
    } catch (error) {
      this.logger.error(`[createUserChannel] Erro ao criar canal - userId: ${userId}`, error.stack);
      throw error;
    }
  }

  /**
   * Lista todos os canais do usuário
   */
  async listUserChannels(userId: string) {
    this.logger.log(`[listUserChannels] Listando canais - userId: ${userId}`);

    try {
      const channels = await this.prisma.userChannel.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      this.logger.log(`[listUserChannels] Canais listados - userId: ${userId}, count: ${channels.length}`);
      return channels;
    } catch (error) {
      this.logger.error(`[listUserChannels] Erro ao listar canais - userId: ${userId}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtém um canal específico
   */
  async getUserChannel(userId: string, channelId: string) {
    this.logger.log(`[getUserChannel] Buscando canal - userId: ${userId}, channelId: ${channelId}`);

    try {
      const channel = await this.prisma.userChannel.findUnique({
        where: { id: channelId },
      });

      if (!channel || channel.userId !== userId) {
        this.logger.warn(`[getUserChannel] Canal não encontrado ou não pertence ao usuário - channelId: ${channelId}`);
        throw new NotFoundException('User channel not found');
      }

      this.logger.log(`[getUserChannel] Canal encontrado - channelId: ${channelId}`);
      return channel;
    } catch (error) {
      this.logger.error(`[getUserChannel] Erro ao buscar canal - channelId: ${channelId}`, error.stack);
      throw error;
    }
  }

  /**
   * Atualiza um canal
   */
  async updateUserChannel(userId: string, channelId: string, updateDto: UpdateUserChannelDto) {
    this.logger.log(`[updateUserChannel] Atualizando canal - userId: ${userId}, channelId: ${channelId}`);

    try {
      // Verificar que o canal pertence ao usuário
      const channel = await this.prisma.userChannel.findUnique({
        where: { id: channelId },
      });

      if (!channel || channel.userId !== userId) {
        this.logger.warn(`[updateUserChannel] Canal não encontrado ou não pertence ao usuário`);
        throw new NotFoundException('User channel not found');
      }

      // Atualizar canal
      const updated = await this.prisma.userChannel.update({
        where: { id: channelId },
        data: {
          displayName: updateDto.displayName,
          credentials: updateDto.credentials,
          isActive: updateDto.isActive,
          metadata: updateDto.metadata,
        },
      });

      this.logger.log(`[updateUserChannel] Canal atualizado com sucesso - channelId: ${channelId}`);
      return updated;
    } catch (error) {
      this.logger.error(`[updateUserChannel] Erro ao atualizar canal - channelId: ${channelId}`, error.stack);
      throw error;
    }
  }

  /**
   * Deleta um canal
   */
  async deleteUserChannel(userId: string, channelId: string) {
    this.logger.log(`[deleteUserChannel] Deletando canal - userId: ${userId}, channelId: ${channelId}`);

    try {
      // Verificar que o canal pertence ao usuário
      const channel = await this.prisma.userChannel.findUnique({
        where: { id: channelId },
      });

      if (!channel || channel.userId !== userId) {
        this.logger.warn(`[deleteUserChannel] Canal não encontrado ou não pertence ao usuário`);
        throw new NotFoundException('User channel not found');
      }

      // Deletar canal
      await this.prisma.userChannel.delete({
        where: { id: channelId },
      });

      this.logger.log(`[deleteUserChannel] Canal deletado com sucesso - channelId: ${channelId}`);
      return { success: true, message: 'User channel deleted successfully' };
    } catch (error) {
      this.logger.error(`[deleteUserChannel] Erro ao deletar canal - channelId: ${channelId}`, error.stack);
      throw error;
    }
  }

  /**
   * Gera um secret para webhook
   */
  private generateSecret(): string {
    return require('crypto').randomBytes(32).toString('hex');
  }

  /**
   * Obtém um canal por channelName e channelUserId
   */
  async getUserChannelByNameAndId(channelName: string, channelUserId: string) {
    this.logger.log(`[getUserChannelByNameAndId] Buscando canal - channel: ${channelName}, channelUserId: ${channelUserId}`);

    try {
      const channels = await this.prisma.userChannel.findMany({
        where: {
          channelName: channelName.toLowerCase(),
          channelUserId,
        },
      });

      if (channels.length === 0) {
        return null;
      }

      return channels[0];
    } catch (error) {
      this.logger.error(`[getUserChannelByNameAndId] Erro ao buscar canal`, error.stack);
      return null;
    }
  }
}
