import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  Res
} from '@nestjs/common';
import { AcceptanceLinksService } from './acceptance.service';
import { renderAcceptancePage, renderTooManyRequestsPage } from './acceptance-page.html';
import { FixedWindowRateLimiter } from './public-rate-limit';
import { AcceptanceDecisionRequestDto } from './dto/acceptance-decision.dto';

type PublicRequest = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
};

type PublicResponse = {
  status(code: number): PublicResponse;
  type(contentType: string): PublicResponse;
  send(body: string): void;
  json(body: unknown): void;
};

const ONE_MINUTE_MS = 60_000;

/**
 * The public homeowner surface: no authentication, token possession is the
 * authorization (docs/acceptance-links-design.md). Aggressively narrow — a
 * decision page and a decision write, both rate-limited.
 */
@Controller('a')
export class AcceptancePageController {
  // Generous for a household behind one IP, hostile to scanners.
  private readonly pageLimiter = new FixedWindowRateLimiter(30, ONE_MINUTE_MS);
  private readonly decisionIpLimiter = new FixedWindowRateLimiter(10, ONE_MINUTE_MS);
  private readonly decisionLinkLimiter = new FixedWindowRateLimiter(5, ONE_MINUTE_MS);

  constructor(private readonly acceptanceLinksService: AcceptanceLinksService) {}

  @Get(':token')
  @Header('Cache-Control', 'no-store')
  async showPage(
    @Req() request: PublicRequest,
    @Res() response: PublicResponse,
    @Param('token') token: string
  ): Promise<void> {
    const now = new Date();
    if (!this.pageLimiter.allow(requesterIp(request) ?? 'unknown', now.getTime())) {
      const limited = renderTooManyRequestsPage();
      response.status(limited.httpStatus).type('html').send(limited.html);
      return;
    }
    const state = await this.acceptanceLinksService.getPageState(token, now);
    const page = renderAcceptancePage(state);
    response.status(page.httpStatus).type('html').send(page.html);
  }

  @Post(':token/decision')
  @HttpCode(200)
  async submitDecision(
    @Req() request: PublicRequest,
    @Res() response: PublicResponse,
    @Param('token') token: string,
    @Body() body: AcceptanceDecisionRequestDto
  ): Promise<void> {
    const now = new Date();
    const ip = requesterIp(request);
    if (
      !this.decisionIpLimiter.allow(ip ?? 'unknown', now.getTime()) ||
      !this.decisionLinkLimiter.allow(token, now.getTime())
    ) {
      response.status(429).json({ message: 'Too many requests. Please try again in a minute.' });
      return;
    }
    const outcome = await this.acceptanceLinksService.applyDecision(
      token,
      {
        decision: body.decision,
        optionId: body.optionId,
        declineReasons: body.declineReasons,
        note: body.note
      },
      ip,
      now
    );
    switch (outcome.kind) {
      case 'recorded':
        response.status(200).json({ state: outcome.decision });
        return;
      case 'alreadySettled':
        response.status(409).json({ state: outcome.state });
        return;
      case 'invalid':
        throw new BadRequestException(outcome.message);
      case 'notFound':
        throw new NotFoundException('This link is not available.');
    }
  }
}

/**
 * The relay sits behind cloudflared, which forwards the visitor address in
 * CF-Connecting-IP; the socket address is the tunnel, not the homeowner.
 */
function requesterIp(request: PublicRequest): string | null {
  const header = request.headers['cf-connecting-ip'];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  return request.ip ?? null;
}
