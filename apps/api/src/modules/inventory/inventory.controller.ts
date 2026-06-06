import { Body, Controller, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { getBearerToken } from '../../common/http/bearer-token';
import { InventoryService } from './inventory.service';
import {
  CreateInventoryAdjustmentRequestBodyDto,
  CreateInventoryIssueRequestBodyDto,
  CreateInventoryItemRequestBodyDto,
  CreateInventoryLocationRequestBodyDto,
  CreateInventoryTransferRequestBodyDto,
  UpdateInventoryItemRequestBodyDto,
  UpdateInventoryLocationRequestBodyDto
} from './inventory.dto';

@Controller('operations/inventory/items')
export class InventoryItemsController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  async list(@Headers('authorization') auth: string | undefined) {
    return this.inventoryService.listItems(getBearerToken(auth));
  }

  @Post()
  async create(
    @Headers('authorization') auth: string | undefined,
    @Body() request: CreateInventoryItemRequestBodyDto
  ) {
    return this.inventoryService.createItem(getBearerToken(auth), request);
  }

  @Put(':itemId')
  async update(
    @Headers('authorization') auth: string | undefined,
    @Param('itemId') itemId: string,
    @Body() request: UpdateInventoryItemRequestBodyDto
  ) {
    return this.inventoryService.updateItem(getBearerToken(auth), itemId, request);
  }
}

@Controller('operations/inventory/locations')
export class InventoryLocationsController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  async list(@Headers('authorization') auth: string | undefined) {
    return this.inventoryService.listLocations(getBearerToken(auth));
  }

  @Post()
  async create(
    @Headers('authorization') auth: string | undefined,
    @Body() request: CreateInventoryLocationRequestBodyDto
  ) {
    return this.inventoryService.createLocation(getBearerToken(auth), request);
  }

  @Put(':locationId')
  async update(
    @Headers('authorization') auth: string | undefined,
    @Param('locationId') locationId: string,
    @Body() request: UpdateInventoryLocationRequestBodyDto
  ) {
    return this.inventoryService.updateLocation(getBearerToken(auth), locationId, request);
  }
}

@Controller('operations/inventory')
export class InventoryLedgerController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('on-hand')
  async onHand(@Headers('authorization') auth: string | undefined) {
    return this.inventoryService.getOnHand(getBearerToken(auth));
  }

  // Field-only: the calling technician's truck stock for the part-add picker (Slice 1b).
  @Get('field/truck-stock')
  async fieldTruckStock(@Headers('authorization') auth: string | undefined) {
    return this.inventoryService.getFieldTruckStock(getBearerToken(auth));
  }

  @Get('movements')
  async movements(
    @Headers('authorization') auth: string | undefined,
    @Query('itemId') itemId?: string,
    @Query('jobId') jobId?: string
  ) {
    return this.inventoryService.listMovements(getBearerToken(auth), { itemId, jobId });
  }

  @Post('adjustments')
  async adjust(
    @Headers('authorization') auth: string | undefined,
    @Body() request: CreateInventoryAdjustmentRequestBodyDto
  ) {
    return this.inventoryService.createAdjustment(getBearerToken(auth), request);
  }

  @Post('transfers')
  async transfer(
    @Headers('authorization') auth: string | undefined,
    @Body() request: CreateInventoryTransferRequestBodyDto
  ) {
    return this.inventoryService.createTransfer(getBearerToken(auth), request);
  }

  @Post('issues')
  async issue(
    @Headers('authorization') auth: string | undefined,
    @Body() request: CreateInventoryIssueRequestBodyDto
  ) {
    return this.inventoryService.issueToJob(getBearerToken(auth), request);
  }
}
