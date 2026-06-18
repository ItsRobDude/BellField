import { Injectable } from '@nestjs/common';
import {
  relayServerInstanceHeader,
  type OnlinePaymentsSetupLinkResponse,
  type OnlinePaymentsSetupStatusResponse
} from '@bellfield/contracts';
import { getApiRuntimeConfig, type ApiRelayConfig } from '../../common/config/runtime-config';
import { IdentityAccessService } from '../identity-access/identity-access.service';

@Injectable()
export class OnlinePaymentsSetupService {
  constructor(private readonly identityAccessService: IdentityAccessService) {}

  async getSetupStatus(sessionToken: string): Promise<OnlinePaymentsSetupStatusResponse> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'companySettings:view', [
      'office-web'
    ]);
    const relay = getApiRuntimeConfig().relay;
    if (!relay) {
      return providerError('Online payments are not configured for this server.');
    }
    return this.requestRelay(relay, '/v1/payments/setup-status', 'GET');
  }

  async createSetupLink(sessionToken: string): Promise<OnlinePaymentsSetupLinkResponse> {
    await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'companySettings:configure',
      ['office-web']
    );
    const relay = getApiRuntimeConfig().relay;
    if (!relay) {
      return providerError('Online payments are not configured for this server.');
    }
    return this.requestRelay(relay, '/v1/payments/setup-link', 'POST');
  }

  async refreshSetupLink(sessionToken: string): Promise<OnlinePaymentsSetupLinkResponse> {
    await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'companySettings:configure',
      ['office-web']
    );
    const relay = getApiRuntimeConfig().relay;
    if (!relay) {
      return providerError('Online payments are not configured for this server.');
    }
    return this.requestRelay(relay, '/v1/payments/setup-refresh', 'POST');
  }

  private async requestRelay<T extends OnlinePaymentsSetupStatusResponse>(
    relay: ApiRelayConfig,
    path: string,
    method: 'GET' | 'POST'
  ): Promise<T> {
    try {
      const response = await fetch(`${relay.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${relay.token}`,
          [relayServerInstanceHeader]: relay.serverInstanceId,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) {
        return providerError('Online payments setup is not available right now.') as T;
      }
      return (await response.json()) as T;
    } catch {
      return providerError('Online payments setup is not available right now.') as T;
    }
  }
}

function providerError(message: string): OnlinePaymentsSetupStatusResponse {
  return { status: 'providerError', message };
}
