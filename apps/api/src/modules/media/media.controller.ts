import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile
} from '@nestjs/common';
import { MediaService } from './media.service';
import type {
  CreateMediaUploadIntentRequestBodyDto,
  UpdateMediaAttachmentRequestBodyDto,
  VoidMediaAttachmentRequestBodyDto
} from './media.dto';

// Minimal request/response shapes to avoid taking on @types/express as a
// new dev dependency. The MediaController only needs rawBody on requests
// and setHeader on responses. main.ts registers the octet-stream raw parser
// with rawBody enabled for the media blob upload path.
type RawBodyRequest = { rawBody?: Buffer | undefined };
type MinimalResponse = { setHeader: (name: string, value: string) => void };

@Controller('operations')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get('jobs/:jobId/media')
  async listForJob(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string
  ) {
    return this.mediaService.listForJob(this.getBearerToken(authorizationHeader), jobId);
  }

  @Post('jobs/:jobId/media/upload-intents')
  async createUploadIntent(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string,
    @Body() request: CreateMediaUploadIntentRequestBodyDto
  ) {
    return this.mediaService.createUploadIntent(
      this.getBearerToken(authorizationHeader),
      jobId,
      request
    );
  }

  @Get('media/:mediaId')
  async getMedia(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('mediaId') mediaId: string
  ) {
    return this.mediaService.getById(this.getBearerToken(authorizationHeader), mediaId);
  }

  @Patch('media/:mediaId')
  async updateMedia(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('mediaId') mediaId: string,
    @Body() request: UpdateMediaAttachmentRequestBodyDto
  ) {
    return this.mediaService.updateMedia(
      this.getBearerToken(authorizationHeader),
      mediaId,
      request
    );
  }

  @Post('media/:mediaId/void')
  async voidMedia(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('mediaId') mediaId: string,
    @Body() request: VoidMediaAttachmentRequestBodyDto
  ) {
    return this.mediaService.voidMedia(this.getBearerToken(authorizationHeader), mediaId, request);
  }

  /**
   * Raw-body byte upload. The route reads `req.rawBody` from the octet-stream
   * parser registered in main.ts. Auth is via the
   * signed upload token from the upload-intent response; no session is
   * required so the field app can finalize uploads with just the minted
   * token.
   */
  @Post('media/:mediaId/blob')
  async uploadBlob(
    @Param('mediaId') mediaId: string,
    @Query('token') uploadToken: string | undefined,
    @Req() request: RawBodyRequest
  ) {
    if (!uploadToken) {
      throw new BadRequestException('Missing upload token.');
    }
    const body = request.rawBody;
    if (!body || !Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestException(
        'Media blob upload requires a binary request body. Set Content-Type: application/octet-stream.'
      );
    }
    return this.mediaService.finalizeBlobUpload(mediaId, uploadToken, body);
  }

  @Get('media/:mediaId/blob')
  async downloadBlob(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('mediaId') mediaId: string,
    @Query('token') downloadToken: string | undefined,
    @Res({ passthrough: true }) response: MinimalResponse
  ): Promise<StreamableFile> {
    const sessionToken = this.getBearerToken(authorizationHeader);
    const { record } = await this.mediaService.authorizeBlobDownload(mediaId, {
      sessionToken: sessionToken || undefined,
      downloadToken: downloadToken || undefined
    });

    response.setHeader('Content-Type', record.contentType);
    response.setHeader('Content-Length', String(record.byteSize));
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(record.originalFilename)}"`
    );

    const stream = await this.mediaService.openBlobReadStream(mediaId, {
      sessionToken: sessionToken || undefined,
      downloadToken: downloadToken || undefined
    });
    return new StreamableFile(stream);
  }

  private getBearerToken(authorizationHeader: string | undefined): string {
    if (!authorizationHeader) {
      return '';
    }
    const [scheme, token] = authorizationHeader.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : '';
  }
}
