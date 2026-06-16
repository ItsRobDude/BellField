import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards
} from '@nestjs/common';
import type {
  RelayEntitlementResponse,
  RelayMessageStatusResponse,
  RelaySendEstimateDocumentResponse,
  RelaySendReceiptMessageResponse
} from '@bellfield/contracts';
import {
  getAuthenticatedShop,
  RelayAuthGuard,
  type RelayAuthenticatedRequest
} from '../identity/relay-auth.guard';
import { EntitlementService } from './entitlement.service';
import { RELAY_MESSAGES_STORE, SendEstimateService } from './send-estimate.service';
import { SendReceiptService } from './send-receipt.service';
import { SendEstimateDocumentRequestDto } from './dto/send-estimate-document.dto';
import { SendReceiptMessageRequestDto } from './dto/send-receipt-message.dto';
import type { RelayMessagesStore } from './relay-delivery.types';

@Controller('v1')
@UseGuards(RelayAuthGuard)
export class DeliveryController {
  constructor(
    private readonly sendEstimateService: SendEstimateService,
    private readonly sendReceiptService: SendReceiptService,
    private readonly entitlementService: EntitlementService,
    @Inject(RELAY_MESSAGES_STORE) private readonly messagesStore: RelayMessagesStore
  ) {}

  @Post('messages/send')
  async sendCustomerDocument(
    @Req() request: RelayAuthenticatedRequest,
    @Body() body: SendEstimateDocumentRequestDto
  ): Promise<RelaySendEstimateDocumentResponse> {
    return this.sendCustomerDocumentFromBody(request, body);
  }

  @Post('messages/estimate')
  async sendEstimateDocumentLegacy(
    @Req() request: RelayAuthenticatedRequest,
    @Body() body: SendEstimateDocumentRequestDto
  ): Promise<RelaySendEstimateDocumentResponse> {
    return this.sendCustomerDocumentFromBody(request, body);
  }

  private async sendCustomerDocumentFromBody(
    request: RelayAuthenticatedRequest,
    body: SendEstimateDocumentRequestDto
  ): Promise<RelaySendEstimateDocumentResponse> {
    const shop = getAuthenticatedShop(request);
    const result = await this.sendEstimateService.sendEstimateDocument(shop, {
      ...body,
      documentType: body.documentType ?? 'estimate'
    });
    return { result };
  }

  @Post('messages/send-receipt')
  async sendReceiptMessage(
    @Req() request: RelayAuthenticatedRequest,
    @Body() body: SendReceiptMessageRequestDto
  ): Promise<RelaySendReceiptMessageResponse> {
    const shop = getAuthenticatedShop(request);
    const result = await this.sendReceiptService.sendReceiptMessage(shop, body);
    return { result };
  }

  @Get('messages/:messageId/status')
  async getMessageStatus(
    @Req() request: RelayAuthenticatedRequest,
    @Param('messageId') messageId: string
  ): Promise<RelayMessageStatusResponse> {
    const shop = getAuthenticatedShop(request);
    const message = await this.messagesStore.findByIdForShop(messageId, shop.shopId);
    if (!message) {
      throw new NotFoundException('Message was not found.');
    }
    return {
      relayMessageId: message.id,
      state: message.status,
      updatedAt: message.updatedAt.toISOString()
    };
  }

  @Get('entitlement')
  async getEntitlement(
    @Req() request: RelayAuthenticatedRequest
  ): Promise<RelayEntitlementResponse> {
    const shop = getAuthenticatedShop(request);
    return this.entitlementService.getEntitlement(shop);
  }
}
