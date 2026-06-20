import { ArgumentsHost, UnauthorizedException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

jest.mock('./logger', () => ({ log: jest.fn() }));

describe('GlobalExceptionFilter', () => {
  it('preserves structured HTTP exception codes in the JSON response', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'GET', url: '/identity/auth/me', headers: {} })
      })
    } as unknown as ArgumentsHost;

    new GlobalExceptionFilter().catch(
      new UnauthorizedException({
        message: 'Session expired. Please sign in again.',
        code: 'sessionExpired'
      }),
      host
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'Session expired. Please sign in again.',
        code: 'sessionExpired',
        path: '/identity/auth/me'
      })
    );
  });
});
