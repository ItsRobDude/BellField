import { Controller, Get, Headers, Res } from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import { SupportService } from './support.service';

// Minimal response shape to set the download header without taking on @types/express
// (mirrors MediaController).
type MinimalResponse = { setHeader: (name: string, value: string) => void };

@Controller('system')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('support-export')
  async getSupportExport(
    @Headers('authorization') auth: string | undefined,
    @Res({ passthrough: true }) response: MinimalResponse
  ) {
    const bundle = await this.supportService.getSupportExport(getBearerToken(auth));
    const stamp = bundle.generatedAt.replace(/[:.]/g, '-');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="bellfield-support-${stamp}.json"`
    );
    return bundle;
  }
}
