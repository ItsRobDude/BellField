import { Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type {
  RelayAcceptanceDecisionAckResponse,
  RelayAcceptanceDecisionsResponse
} from '@bellfield/contracts';
import {
  getAuthenticatedShop,
  RelayAuthGuard,
  type RelayAuthenticatedRequest
} from '../identity/relay-auth.guard';
import { AcceptanceLinksService } from './acceptance.service';

/**
 * Install-facing decision pickup: at-least-once delivery, acked per decision.
 * Rows are retained after ack (tiny, billing-adjacent evidence).
 */
@Controller('v1')
@UseGuards(RelayAuthGuard)
export class AcceptanceDecisionsController {
  constructor(private readonly acceptanceLinksService: AcceptanceLinksService) {}

  @Get('acceptance-decisions')
  async listUndelivered(
    @Req() request: RelayAuthenticatedRequest
  ): Promise<RelayAcceptanceDecisionsResponse> {
    const shop = getAuthenticatedShop(request);
    const decisions = await this.acceptanceLinksService.listUndeliveredDecisions(shop.shopId);
    return { decisions };
  }

  @Post('acceptance-decisions/:acceptanceLinkId/ack')
  @HttpCode(200)
  async acknowledge(
    @Req() request: RelayAuthenticatedRequest,
    @Param('acceptanceLinkId') acceptanceLinkId: string
  ): Promise<RelayAcceptanceDecisionAckResponse> {
    const shop = getAuthenticatedShop(request);
    const acknowledged = await this.acceptanceLinksService.acknowledgeDecision(
      shop.shopId,
      acceptanceLinkId,
      new Date()
    );
    return { acknowledged };
  }
}
