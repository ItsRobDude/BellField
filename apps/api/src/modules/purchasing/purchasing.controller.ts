import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import { PurchasingService } from './purchasing.service';
import {
  CreatePurchaseOrderRequestBodyDto,
  ReceivePurchaseOrderRequestBodyDto
} from './purchasing.dto';

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

  @Post(':id/receive')
  async receive(
    @Headers('authorization') auth: string | undefined,
    @Param('id') id: string,
    @Body() request: ReceivePurchaseOrderRequestBodyDto
  ) {
    return this.purchasingService.receivePurchaseOrder(getBearerToken(auth), id, request);
  }
}
