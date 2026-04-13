import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateEquipmentInput,
  EquipmentRecord,
  UpdateEquipmentInput
} from './company-data.types';
import { seededEquipment } from './seed-company-data';

@Injectable()
export class EquipmentDataService {
  private readonly equipment = new Map<string, EquipmentRecord>(
    seededEquipment.map((equipmentRecord) => [equipmentRecord.id, structuredClone(equipmentRecord)])
  );

  listEquipment(includeInactive: boolean): EquipmentRecord[] {
    return [...this.equipment.values()]
      .filter((equipmentRecord) => includeInactive || equipmentRecord.status !== 'inactive')
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  createEquipment(input: CreateEquipmentInput): EquipmentRecord {
    const now = new Date().toISOString();
    const equipmentRecord: EquipmentRecord = {
      id: randomUUID(),
      locationId: input.locationId,
      inventoryLocationLabel: input.inventoryLocationLabel?.trim() || undefined,
      equipmentType: input.equipmentType.trim(),
      brand: input.brand.trim(),
      model: input.model.trim(),
      serialNumber: input.serialNumber.trim(),
      filterSizes: this.normalizeFilterSizes(input.filterSizes),
      equipmentLocationDescription: input.equipmentLocationDescription?.trim() || undefined,
      installDate: input.installDate?.trim() || undefined,
      status: input.status,
      notes: input.notes?.trim() || '',
      createdAt: now,
      updatedAt: now
    };

    this.equipment.set(equipmentRecord.id, equipmentRecord);
    return equipmentRecord;
  }

  updateEquipment(equipmentId: string, update: UpdateEquipmentInput): EquipmentRecord {
    const existingEquipment = this.getEquipmentById(equipmentId);

    if (update.locationId !== undefined) {
      existingEquipment.locationId = update.locationId || undefined;
    }

    if (update.inventoryLocationLabel !== undefined) {
      existingEquipment.inventoryLocationLabel = update.inventoryLocationLabel?.trim() || undefined;
    }

    if (update.equipmentType !== undefined) {
      existingEquipment.equipmentType = update.equipmentType.trim();
    }

    if (update.brand !== undefined) {
      existingEquipment.brand = update.brand.trim();
    }

    if (update.model !== undefined) {
      existingEquipment.model = update.model.trim();
    }

    if (update.serialNumber !== undefined) {
      existingEquipment.serialNumber = update.serialNumber.trim();
    }

    if (update.filterSizes !== undefined) {
      existingEquipment.filterSizes = this.normalizeFilterSizes(update.filterSizes);
    }

    if (update.equipmentLocationDescription !== undefined) {
      existingEquipment.equipmentLocationDescription = update.equipmentLocationDescription?.trim() || undefined;
    }

    if (update.installDate !== undefined) {
      existingEquipment.installDate = update.installDate?.trim() || undefined;
    }

    if (update.status !== undefined) {
      existingEquipment.status = update.status;
    }

    if (update.notes !== undefined) {
      existingEquipment.notes = update.notes.trim();
    }

    existingEquipment.updatedAt = new Date().toISOString();
    this.equipment.set(existingEquipment.id, existingEquipment);

    return existingEquipment;
  }

  getEquipmentById(equipmentId: string): EquipmentRecord {
    const equipmentRecord = this.equipment.get(equipmentId);

    if (!equipmentRecord) {
      throw new NotFoundException('Equipment record not found.');
    }

    return equipmentRecord;
  }

  private normalizeFilterSizes(filterSizes: string[]): string[] {
    return [...new Set(filterSizes.map((value) => value.trim()).filter(Boolean))];
  }
}
