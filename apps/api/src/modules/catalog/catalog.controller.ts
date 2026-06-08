import { Body, Controller, Get, Headers, Param, Post, Put } from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import { CatalogService } from './catalog.service';
import { CreateCatalogItemRequestBodyDto, UpdateCatalogItemRequestBodyDto } from './catalog.dto';

@Controller('operations/catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('items')
  async items(@Headers('authorization') auth: string | undefined) {
    return this.catalogService.listItems(getBearerToken(auth));
  }

  @Post('items')
  async createItem(
    @Headers('authorization') auth: string | undefined,
    @Body() request: CreateCatalogItemRequestBodyDto
  ) {
    return this.catalogService.createItem(getBearerToken(auth), request);
  }

  @Put('items/:catalogItemId')
  async updateItem(
    @Headers('authorization') auth: string | undefined,
    @Param('catalogItemId') catalogItemId: string,
    @Body() request: UpdateCatalogItemRequestBodyDto
  ) {
    return this.catalogService.updateItem(getBearerToken(auth), catalogItemId, request);
  }

  @Get('field-items')
  async fieldItems(@Headers('authorization') auth: string | undefined) {
    return this.catalogService.getFieldCatalog(getBearerToken(auth));
  }
}
