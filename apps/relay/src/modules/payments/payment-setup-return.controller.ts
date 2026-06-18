import { Controller, Get, Header, Res } from '@nestjs/common';

type PublicResponse = {
  status(code: number): PublicResponse;
  type(contentType: string): PublicResponse;
  send(body: string): void;
};

@Controller('payments/setup')
export class PaymentSetupReturnController {
  @Get('return')
  @Header('Cache-Control', 'no-store')
  setupReturn(@Res() response: PublicResponse): void {
    response.status(200).type('html').send(renderSetupReturnPage('return'));
  }

  @Get('refresh')
  @Header('Cache-Control', 'no-store')
  setupRefresh(@Res() response: PublicResponse): void {
    response.status(200).type('html').send(renderSetupReturnPage('refresh'));
  }
}

function renderSetupReturnPage(state: 'return' | 'refresh'): string {
  const isRefresh = state === 'refresh';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${isRefresh ? 'Setup link expired' : 'Online payments setup'}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 24px 16px; background: #f4f5f7; color: #1d232b;
         font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .card { max-width: 520px; margin: 0 auto; background: #fff; border: 1px solid #dde1e6;
          border-radius: 10px; padding: 28px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { color: #5a6472; margin: 0; line-height: 1.5; }
</style>
</head>
<body>
<div class="card">
  <h1>${isRefresh ? 'Setup link expired' : 'Online payments setup'}</h1>
  <p>${
    isRefresh
      ? 'Return to BellField Settings and choose Continue setup to open a fresh setup link.'
      : 'Return to BellField Settings to refresh the setup status.'
  }</p>
</div>
</body>
</html>`;
}
