import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { log } from './logger';

type HttpRequest = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
};

type HttpResponse = {
  status(code: number): { json(payload: ErrorResponseBody): void };
};

type ErrorResponseBody = {
  statusCode: number;
  message: string;
  error: string;
  code?: string;
  timestamp: string;
  path: string;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<HttpResponse>();
    const request = context.getRequest<HttpRequest>();

    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const errorResponse = this.buildErrorResponse(exception, statusCode, request.url);

    log('error', 'API request failed.', {
      method: request.method,
      path: request.url,
      statusCode,
      requestId: request.headers['x-request-id'],
      errorName: exception instanceof Error ? exception.name : 'UnknownError',
      errorMessage:
        exception instanceof Error ? exception.message : 'Unhandled non-error exception',
      stack: exception instanceof Error ? exception.stack : undefined
    });

    response.status(statusCode).json(errorResponse);
  }

  private buildErrorResponse(
    exception: unknown,
    statusCode: number,
    path: string
  ): ErrorResponseBody {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const defaultMessage = exception.message;
      const message =
        typeof response === 'string'
          ? response
          : this.getExceptionMessage(response, defaultMessage);
      const code = this.getExceptionCode(response);

      return {
        statusCode,
        message,
        error: HttpStatus[statusCode] ?? 'HttpException',
        ...(code ? { code } : {}),
        timestamp: new Date().toISOString(),
        path
      };
    }

    return {
      statusCode,
      message: 'Internal server error',
      error: 'InternalServerError',
      timestamp: new Date().toISOString(),
      path
    };
  }

  private getExceptionMessage(response: unknown, defaultMessage: string): string {
    if (!response || typeof response !== 'object') {
      return defaultMessage;
    }

    if ('message' in response && Array.isArray(response.message)) {
      return response.message.join('; ');
    }

    if ('message' in response) {
      return String(response.message);
    }

    return defaultMessage;
  }

  private getExceptionCode(response: unknown): string | undefined {
    if (!response || typeof response !== 'object' || !('code' in response)) {
      return undefined;
    }

    return typeof response.code === 'string' ? response.code : undefined;
  }
}
