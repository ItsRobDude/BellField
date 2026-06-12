import { createReadStream } from 'node:fs';
import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Req,
  ServiceUnavailableException,
  StreamableFile,
  UseGuards
} from '@nestjs/common';
import {
  getShopIdentity,
  RelayIdentityGuard,
  type RelayAuthenticatedRequest
} from '../identity/relay-auth.guard';
import { ReleasesService, type ReleaseListing } from './releases.service';

@Controller('v1/releases')
@UseGuards(RelayIdentityGuard)
export class ReleasesController {
  constructor(private readonly releasesService: ReleasesService) {}

  @Get()
  async listReleases(@Req() request: RelayAuthenticatedRequest): Promise<ReleaseListing> {
    return this.releasesService.listReleasesForShop(getShopIdentity(request));
  }

  @Get(':releaseId/download')
  async downloadRelease(
    @Req() request: RelayAuthenticatedRequest,
    @Param('releaseId') releaseId: string
  ): Promise<StreamableFile> {
    const resolution = await this.releasesService.resolveDownload(
      getShopIdentity(request),
      releaseId
    );
    if (resolution.kind === 'unavailable') {
      throw new ServiceUnavailableException('Release downloads are not available right now.');
    }
    if (resolution.kind === 'notFound') {
      throw new NotFoundException('Release was not found.');
    }
    if (resolution.kind === 'notEntitled') {
      throw new ForbiddenException(
        'This release is outside the update window for this license. Contact BellField to renew updates.'
      );
    }
    return new StreamableFile(createReadStream(resolution.absolutePath), {
      type: 'application/zip',
      disposition: `attachment; filename="${resolution.release.filename}"`,
      length: resolution.release.byteSize
    });
  }
}
