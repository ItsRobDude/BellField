import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateEquipmentRequestBodyDto,
  LinkEquipmentReplacementRequestBodyDto,
  UpdateEquipmentFieldRequestBodyDto
} from './equipment.dto';
import { EquipmentService } from './equipment.service';

@Controller('operations/equipment')
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get()
  getWorkspace(
    @Headers('authorization') authorizationHeader?: string,
    @Query('includeInactive') includeInactive?: string
  ) {
    return this.equipmentService.getWorkspace(
      this.getBearerToken(authorizationHeader),
      includeInactive === 'true'
    );
  }

  @Post()
  createEquipment(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() request: CreateEquipmentRequestBodyDto
  ) {
    return this.equipmentService.createEquipment(this.getBearerToken(authorizationHeader), request);
  }

  @Get(':equipmentId')
  getEquipmentDetail(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('equipmentId') equipmentId: string
  ) {
    return this.equipmentService.getEquipmentDetail(
      this.getBearerToken(authorizationHeader),
      equipmentId
    );
  }

  @Patch(':equipmentId')
  updateEquipment(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('equipmentId') equipmentId: string,
    @Body() request: UpdateEquipmentFieldRequestBodyDto
  ) {
    return this.equipmentService.updateEquipment(
      this.getBearerToken(authorizationHeader),
      equipmentId,
      request
    );
  }

  @Post(':equipmentId/replacement-link')
  linkEquipmentReplacement(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('equipmentId') equipmentId: string,
    @Body() request: LinkEquipmentReplacementRequestBodyDto
  ) {
    return this.equipmentService.linkEquipmentReplacement(
      this.getBearerToken(authorizationHeader),
      equipmentId,
      request
    );
  }

  @Delete(':equipmentId')
  deleteEquipment(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('equipmentId') equipmentId: string,
    @Query('confirm') confirmDelete?: string
  ) {
    return this.equipmentService.deleteEquipment(
      this.getBearerToken(authorizationHeader),
      equipmentId,
      confirmDelete === 'true'
    );
  }

  private getBearerToken(authorizationHeader: string | undefined): string {
    if (!authorizationHeader) {
      return '';
    }

    const [scheme, token] = authorizationHeader.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : '';
  }
}
