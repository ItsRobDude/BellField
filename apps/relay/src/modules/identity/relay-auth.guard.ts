import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { relayServerInstanceHeader } from '@bellfield/contracts';
import { RelayAuthService } from './relay-auth.service';
import type { AuthenticatedRelayShop, RelayShopIdentity } from './relay-identity.types';

export type RelayAuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>;
  relayShop?: AuthenticatedRelayShop;
  relayShopIdentity?: RelayShopIdentity;
};

@Injectable()
export class RelayAuthGuard implements CanActivate {
  constructor(private readonly relayAuthService: RelayAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RelayAuthenticatedRequest>();
    const authorization = request.headers['authorization'];
    const bearerToken =
      typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length).trim()
        : undefined;
    const instanceHeader = request.headers[relayServerInstanceHeader];
    const instanceId = typeof instanceHeader === 'string' ? instanceHeader.trim() : undefined;

    const result = await this.relayAuthService.authenticate(bearerToken, instanceId);
    if (result.outcome === 'authenticated') {
      request.relayShop = result.shop;
      return true;
    }
    if (result.outcome === 'suspended') {
      throw new ForbiddenException('This shop is not currently able to use the delivery service.');
    }
    throw new UnauthorizedException('Relay credentials were not accepted.');
  }
}

export function getAuthenticatedShop(request: RelayAuthenticatedRequest): AuthenticatedRelayShop {
  if (!request.relayShop) {
    throw new UnauthorizedException('Relay credentials were not accepted.');
  }
  return request.relayShop;
}

/**
 * Token-identity guard without activation binding — for release downloads,
 * where authenticating must never move or flap the shop's activation.
 */
@Injectable()
export class RelayIdentityGuard implements CanActivate {
  constructor(private readonly relayAuthService: RelayAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RelayAuthenticatedRequest>();
    const authorization = request.headers['authorization'];
    const bearerToken =
      typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length).trim()
        : undefined;

    const result = await this.relayAuthService.verifyToken(bearerToken);
    if (result.outcome === 'identified') {
      request.relayShopIdentity = result.shop;
      return true;
    }
    if (result.outcome === 'suspended') {
      throw new ForbiddenException('This shop is not currently able to use the delivery service.');
    }
    throw new UnauthorizedException('Relay credentials were not accepted.');
  }
}

export function getShopIdentity(request: RelayAuthenticatedRequest): RelayShopIdentity {
  if (!request.relayShopIdentity) {
    throw new UnauthorizedException('Relay credentials were not accepted.');
  }
  return request.relayShopIdentity;
}
