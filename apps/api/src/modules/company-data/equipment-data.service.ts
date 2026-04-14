import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateEquipmentInput,
  EquipmentRecord,
  UpdateEquipmentInput
} from './company-data.types';
import { EquipmentDataRepository } from './equipment-data.repository';

@Injectable()
export class EquipmentDataService {
  constructor(private readonly equipmentDataRepository: EquipmentDataRepository) {}

  async listEquipment(includeInactive: boolean): Promise<EquipmentRecord[]> {
    return this.equipmentDataRepository.listEquipment(includeInactive);
  }

  async createEquipment(input: CreateEquipmentInput): Promise<EquipmentRecord> {
    return this.equipmentDataRepository.createEquipment(input);
  }

  async updateEquipment(equipmentId: string, update: UpdateEquipmentInput): Promise<EquipmentRecord> {
    const updatedEquipment = await this.equipmentDataRepository.updateEquipment(equipmentId, update);

    if (!updatedEquipment) {
      throw new NotFoundException('Equipment record not found.');
    }

    return updatedEquipment;
  }

  async getEquipmentById(equipmentId: string): Promise<EquipmentRecord> {
    const equipmentRecord = await this.equipmentDataRepository.getEquipmentById(equipmentId);

    if (!equipmentRecord) {
      throw new NotFoundException('Equipment record not found.');
    }

    return equipmentRecord;
  }
}
