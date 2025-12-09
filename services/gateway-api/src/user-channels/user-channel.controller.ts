import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Request, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserChannelService } from './user-channel.service';
import { CreateUserChannelDto } from './dto/create-user-channel.dto';
import { UpdateUserChannelDto } from './dto/update-user-channel.dto';

@Controller('user-channels')
@UseGuards(JwtAuthGuard)
export class UserChannelController {
  private readonly logger = new Logger(UserChannelController.name);

  constructor(private userChannelService: UserChannelService) {}

  /**
   * Cria um novo canal para o usuário autenticado
   * POST /user-channels
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Request() req, @Body() createDto: CreateUserChannelDto) {
    const userId = req.user?.userId || req.user?.sub;
    this.logger.log(`[create] Criando canal - userId: ${userId}`);

    const channel = await this.userChannelService.createUserChannel(userId, createDto);

    return {
      success: true,
      message: 'User channel created successfully',
      data: channel,
    };
  }

  /**
   * Lista todos os canais do usuário autenticado
   * GET /user-channels
   */
  @Get()
  async list(@Request() req) {
    const userId = req.user?.userId || req.user?.sub;
    this.logger.log(`[list] Listando canais - userId: ${userId}`);

    const channels = await this.userChannelService.listUserChannels(userId);

    return {
      success: true,
      data: channels,
      count: channels.length,
    };
  }

  /**
   * Obtém um canal específico
   * GET /user-channels/:id
   */
  @Get(':id')
  async getOne(@Request() req, @Param('id') channelId: string) {
    const userId = req.user?.userId || req.user?.sub;
    this.logger.log(`[getOne] Buscando canal - userId: ${userId}, channelId: ${channelId}`);

    const channel = await this.userChannelService.getUserChannel(userId, channelId);

    return {
      success: true,
      data: channel,
    };
  }

  /**
   * Atualiza um canal
   * PUT /user-channels/:id
   */
  @Put(':id')
  async update(@Request() req, @Param('id') channelId: string, @Body() updateDto: UpdateUserChannelDto) {
    const userId = req.user?.userId || req.user?.sub;
    this.logger.log(`[update] Atualizando canal - userId: ${userId}, channelId: ${channelId}`);

    const channel = await this.userChannelService.updateUserChannel(userId, channelId, updateDto);

    return {
      success: true,
      message: 'User channel updated successfully',
      data: channel,
    };
  }

  /**
   * Deleta um canal
   * DELETE /user-channels/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Request() req, @Param('id') channelId: string) {
    const userId = req.user?.userId || req.user?.sub;
    this.logger.log(`[delete] Deletando canal - userId: ${userId}, channelId: ${channelId}`);

    const result = await this.userChannelService.deleteUserChannel(userId, channelId);

    return {
      success: true,
      message: result.message,
    };
  }
}
