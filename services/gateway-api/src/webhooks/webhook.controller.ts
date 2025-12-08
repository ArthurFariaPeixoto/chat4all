import { Controller, Post, Body, Headers, HttpCode, HttpStatus, Logger, UnauthorizedException, Req } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { DeliveryCallbackDto, ReadCallbackDto } from './dto/webhook.dto';
import { Request } from 'express';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  /**
   * Recebe callback de entrega de mensagem de canais externos
   * POST /webhooks/delivery
   */
  @Post('delivery')
  @HttpCode(HttpStatus.OK)
  async handleDeliveryCallback(
    @Req() req: Request,
    @Body() deliveryData: DeliveryCallbackDto,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Headers('x-webhook-channel') channel: string | undefined,
  ) {
    try {
      this.logger.log(`[handleDeliveryCallback] Recebido callback de entrega - message_id: ${deliveryData.message_id}, channel: ${channel}`);

      // Fallback para headers sem "webhook-"
      const sig = signature || (req.headers['x-signature'] as string);
      const ch = channel || (req.headers['x-channel'] as string) || 'generic';

      // Usar o body raw da requisição para validar a assinatura
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      // Validar assinatura HMAC
      const isValid = await this.webhookService.validateSignatureRaw(
        rawBody,
        sig,
        ch,
      );

      if (!isValid) {
        this.logger.warn(`[handleDeliveryCallback] Assinatura inválida - message_id: ${deliveryData.message_id}, channel: ${ch}`);
        throw new UnauthorizedException('Invalid webhook signature');
      }

      // Processar callback de entrega
      await this.webhookService.processDeliveryCallback(deliveryData, ch);

      this.logger.log(`[handleDeliveryCallback] Callback de entrega processado com sucesso - message_id: ${deliveryData.message_id}`);

      return {
        status: 'success',
        message: 'Delivery callback processed',
      };
    } catch (error) {
      this.logger.error(`[handleDeliveryCallback] Erro ao processar callback`, error.stack);
      throw error;
    }
  }

  /**
   * Recebe callback de leitura de mensagem de canais externos
   * POST /webhooks/read
   */
  @Post('read')
  @HttpCode(HttpStatus.OK)
  async handleReadCallback(
    @Req() req: Request,
    @Body() readData: ReadCallbackDto,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Headers('x-webhook-channel') channel: string | undefined,
  ) {
    try {
      this.logger.log(`[handleReadCallback] Recebido callback de leitura - message_id: ${readData.message_id}, channel: ${channel}`);

      // Fallback para headers sem "webhook-"
      const sig = signature || (req.headers['x-signature'] as string);
      const ch = channel || (req.headers['x-channel'] as string) || 'generic';

      // Usar o body raw da requisição para validar a assinatura
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      // Validar assinatura HMAC
      const isValid = await this.webhookService.validateSignatureRaw(
        rawBody,
        sig,
        ch,
      );

      if (!isValid) {
        this.logger.warn(`[handleReadCallback] Assinatura inválida - message_id: ${readData.message_id}, channel: ${ch}`);
        throw new UnauthorizedException('Invalid webhook signature');
      }

      // Processar callback de leitura
      await this.webhookService.processReadCallback(readData, ch);

      this.logger.log(`[handleReadCallback] Callback de leitura processado com sucesso - message_id: ${readData.message_id}`);

      return {
        status: 'success',
        message: 'Read callback processed',
      };
    } catch (error) {
      this.logger.error(`[handleReadCallback] Erro ao processar callback`, error.stack);
      throw error;
    }
  }

  /**
   * Webhook genérico para canais que usam um único endpoint
   * POST /webhooks/:channel
   * Exemplo: POST /webhooks/whatsapp
   */
  @Post(':channel')
  @HttpCode(HttpStatus.OK)
  async handleGenericWebhook(
    @Body() webhookData: any,
    @Headers('x-signature') signature: string,
    @Headers() headers: Record<string, string>,
  ) {
    const channel = headers['x-channel'] || webhookData.channel;
    
    this.logger.log(`[handleGenericWebhook] Recebido webhook genérico - channel: ${channel}`);

    // Validar assinatura HMAC
    const isValid = await this.webhookService.validateSignature(
      webhookData,
      signature,
      channel,
    );

    if (!isValid) {
      this.logger.warn(`[handleGenericWebhook] Assinatura inválida - channel: ${channel}`);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Processar webhook genérico (adaptar formato específico do canal)
    await this.webhookService.processGenericWebhook(webhookData, channel);

    this.logger.log(`[handleGenericWebhook] Webhook genérico processado com sucesso - channel: ${channel}`);

    return {
      status: 'success',
      message: 'Webhook processed',
    };
  }
}
