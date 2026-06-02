import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { PurchasingService } from './purchasing.service';
import { CreatePurchaseOrderRequestBodyDto } from './purchasing.dto';

function getBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader) {
    return '';
  }
  const [scheme, token] = authorizationHeader.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : '';
}

@Controller('operations/purchase-orders')
export class PurchasingController {
  constructor(private readonly purchasingService: PurchasingService) {}

  @Get()
  async list(@Headers('authorization') auth: string | undefined) {
    return this.purchasingService.listPurchaseOrders(getBearerToken(auth));
  }

  @Get(':id')
  async getOne(@Headers('authorization') auth: string | undefined, @Param('id') id: string) {
    return this.purchasingService.getPurchaseOrder(getBearerToken(auth), id);
  }

  @Post()
  async create(
    @Headers('authorization') auth: string | undefined,
    @Body() request: CreatePurchaseOrderRequestBodyDto
  ) {
    return this.purchasingService.createPurchaseOrder(getBearerToken(auth), request);
  }

  @Post(':id/order')
  async order(@Headers('authorization') auth: string | undefined, @Param('id') id: string) {
    return this.purchasingService.orderPurchaseOrder(getBearerToken(auth), id);
  }
}
