import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { EquipmentService } from './equipment.service';
import type { CreateEquipmentRequestDto, UpdateEquipmentFieldRequestDto } from './equipment.types';

@Controller('operations/equipment')
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get()
  getWorkspace(
    @Headers('authorization') authorizationHeader?: string,
    @Query('includeInactive') includeInactive?: string
  ) {
    return this.equipmentService.getWorkspace(this.getBearerToken(authorizationHeader), includeInactive === 'true');
  }

  @Post()
  createEquipment(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() request: CreateEquipmentRequestDto
  ) {
    return this.equipmentService.createEquipment(this.getBearerToken(authorizationHeader), request);
  }

  @Patch(':equipmentId')
  updateEquipment(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('equipmentId') equipmentId: string,
    @Body() request: UpdateEquipmentFieldRequestDto
  ) {
    return this.equipmentService.updateEquipment(this.getBearerToken(authorizationHeader), equipmentId, request);
  }

  private getBearerToken(authorizationHeader: string | undefined): string {
    if (!authorizationHeader) {
      return '';
    }

    const [scheme, token] = authorizationHeader.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : '';
  }
}
