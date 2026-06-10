import { Body, Controller, Get, Headers, Param, Post, Put } from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import { CatalogService } from './catalog.service';
import {
  CreateCatalogCategoryRequestBodyDto,
  CreateCatalogItemRequestBodyDto,
  UpdateCatalogCategoryRequestBodyDto,
  UpdateCatalogItemRequestBodyDto
} from './catalog.dto';

@Controller('operations/catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('items')
  async items(@Headers('authorization') auth: string | undefined) {
    return this.catalogService.listItems(getBearerToken(auth));
  }

  @Get('categories')
  async categories(@Headers('authorization') auth: string | undefined) {
    return this.catalogService.listCategories(getBearerToken(auth));
  }

  @Post('categories')
  async createCategory(
    @Headers('authorization') auth: string | undefined,
    @Body() request: CreateCatalogCategoryRequestBodyDto
  ) {
    return this.catalogService.createCategory(getBearerToken(auth), request);
  }

  @Put('categories/:catalogCategoryId')
  async updateCategory(
    @Headers('authorization') auth: string | undefined,
    @Param('catalogCategoryId') catalogCategoryId: string,
    @Body() request: UpdateCatalogCategoryRequestBodyDto
  ) {
    return this.catalogService.updateCategory(getBearerToken(auth), catalogCategoryId, request);
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
