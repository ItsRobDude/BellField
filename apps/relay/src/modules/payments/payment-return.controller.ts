import { Controller, Get, Header, Res } from '@nestjs/common';

type PublicResponse = {
  status(code: number): PublicResponse;
  type(contentType: string): PublicResponse;
  send(body: string): void;
};

@Controller('payment-return')
export class PaymentReturnController {
  @Get('success')
  @Header('Cache-Control', 'no-store')
  success(@Res() response: PublicResponse): void {
    response.status(200).type('html').send(renderPaymentReturnPage('success'));
  }

  @Get('canceled')
  @Header('Cache-Control', 'no-store')
  canceled(@Res() response: PublicResponse): void {
    response.status(200).type('html').send(renderPaymentReturnPage('canceled'));
  }
}

function renderPaymentReturnPage(state: 'success' | 'canceled'): string {
  const isSuccess = state === 'success';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${isSuccess ? 'Payment received' : 'Payment not completed'}</title>
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
  <h1>${isSuccess ? 'Payment received' : 'Payment not completed'}</h1>
  <p>${
    isSuccess
      ? 'Thanks. The office will see the payment after processing finishes.'
      : 'No payment was completed. You can return to the payment link if you still need to pay.'
  }</p>
</div>
</body>
</html>`;
}
