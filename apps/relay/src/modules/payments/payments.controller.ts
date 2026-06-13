import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type {
  RelayCreatePaymentSessionResponse,
  RelayPaymentEventAckResponse,
  RelayPaymentEventsResponse
} from '@bellfield/contracts';
import {
  getAuthenticatedShop,
  RelayAuthGuard,
  type RelayAuthenticatedRequest
} from '../identity/relay-auth.guard';
import { CreatePaymentSessionRequestDto } from './dto/create-payment-session.dto';
import { RelayPaymentsService } from './payments.service';

@Controller('v1')
@UseGuards(RelayAuthGuard)
export class PaymentsController {
  constructor(private readonly relayPaymentsService: RelayPaymentsService) {}

  @Post('payment-sessions')
  async createPaymentSession(
    @Req() request: RelayAuthenticatedRequest,
    @Body() body: CreatePaymentSessionRequestDto
  ): Promise<RelayCreatePaymentSessionResponse> {
    const shop = getAuthenticatedShop(request);
    const result = await this.relayPaymentsService.createPaymentSession(shop, body);
    return { result };
  }

  @Get('payment-events')
  async listPaymentEvents(
    @Req() request: RelayAuthenticatedRequest
  ): Promise<RelayPaymentEventsResponse> {
    const shop = getAuthenticatedShop(request);
    return this.relayPaymentsService.listUndeliveredPaymentEvents(shop.shopId);
  }

  @Post('payment-events/:paymentEventId/ack')
  @HttpCode(200)
  async acknowledgePaymentEvent(
    @Req() request: RelayAuthenticatedRequest,
    @Param('paymentEventId') paymentEventId: string
  ): Promise<RelayPaymentEventAckResponse> {
    const shop = getAuthenticatedShop(request);
    return this.relayPaymentsService.acknowledgePaymentEvent(
      shop.shopId,
      paymentEventId,
      new Date()
    );
  }
}
