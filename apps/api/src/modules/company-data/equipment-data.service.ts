import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import type {
  CreateEquipmentInput,
  EquipmentGroupRecord,
  EquipmentHistoryRecord,
  EquipmentRecord,
  UpdateEquipmentInput
} from './company-data.types';
import { EquipmentDataRepository } from './equipment-data.repository';

export const equipmentTypeSuggestions = [
  'Condenser',
  'Coil',
  'Gas Furnace',
  'Air Handler',
  'Package Unit',
  'Heat Pump',
  'Water Heater',
  'Tankless Water Heater',
  'Boiler',
  'Mini Split Head',
  'Mini Split Condenser',
  'Generator'
] as const;

@Injectable()
export class EquipmentDataService {
  constructor(
    private readonly equipmentDataRepository: EquipmentDataRepository,
    private readonly databaseService: DatabaseService
  ) {}

  async listEquipment(includeInactive: boolean): Promise<EquipmentRecord[]> {
    return this.equipmentDataRepository.listEquipment(includeInactive);
  }

  async listEquipmentByLocation(locationId: string, includeInactive: boolean): Promise<EquipmentRecord[]> {
    return this.equipmentDataRepository.listEquipmentByLocation(locationId, includeInactive);
  }

  async listEquipmentByLocations(locationIds: string[], includeInactive: boolean): Promise<EquipmentRecord[]> {
    return this.equipmentDataRepository.listEquipmentByLocations(locationIds, includeInactive);
  }

  async listEquipmentByIds(equipmentIds: string[]): Promise<EquipmentRecord[]> {
    return this.equipmentDataRepository.listEquipmentByIds(equipmentIds);
  }

  getEquipmentTypeSuggestions(): string[] {
    return [...equipmentTypeSuggestions];
  }

  async createEquipment(input: CreateEquipmentInput, actorName: string): Promise<EquipmentRecord> {
    const createdEquipmentId = await this.databaseService.transaction(async (queryable) => {
      const createdEquipment = await this.equipmentDataRepository.createEquipment(input, queryable);

      await this.equipmentDataRepository.addEquipmentHistoryEntry(
        {
          id: randomUUID(),
          equipmentId: createdEquipment.id,
          occurredAt: createdEquipment.createdAt,
          actorName,
          kind: 'created',
          message: 'Equipment record created.'
        },
        queryable
      );

      return createdEquipment.id;
    });

    return this.getEquipmentById(createdEquipmentId);
  }

  async updateEquipment(
    equipmentId: string,
    update: UpdateEquipmentInput,
    actorName: string
  ): Promise<EquipmentRecord> {
    const existingEquipment = await this.getEquipmentById(equipmentId);
    const existingGroup = existingEquipment.systemGroupId
      ? await this.equipmentDataRepository.getEquipmentGroupById(existingEquipment.systemGroupId)
      : null;

    const updatedEquipmentId = await this.databaseService.transaction(async (queryable) => {
      const updatedEquipment = await this.equipmentDataRepository.updateEquipment(equipmentId, update, queryable);

      if (!updatedEquipment) {
        throw new NotFoundException('Equipment record not found.');
      }

      const nextGroup = updatedEquipment.systemGroupId
        ? await this.equipmentDataRepository.getEquipmentGroupById(updatedEquipment.systemGroupId)
        : null;
      const historyEntries = this.buildUpdateHistoryEntries(existingEquipment, updatedEquipment, actorName, existingGroup, nextGroup);

      for (const entry of historyEntries) {
        await this.equipmentDataRepository.addEquipmentHistoryEntry(entry, queryable);
      }

      return updatedEquipment.id;
    });

    return this.getEquipmentById(updatedEquipmentId);
  }

  async linkReplacement(
    oldEquipmentId: string,
    replacementEquipmentId: string,
    actorName: string
  ): Promise<{ oldEquipment: EquipmentRecord; replacementEquipment: EquipmentRecord }> {
    const oldEquipment = await this.getEquipmentById(oldEquipmentId);
    const replacementEquipment = await this.getEquipmentById(replacementEquipmentId);

    await this.databaseService.transaction(async (queryable) => {
      await this.equipmentDataRepository.updateEquipment(oldEquipment.id, { status: 'removed' }, queryable);
      await this.equipmentDataRepository.linkReplacement(replacementEquipment.id, oldEquipment.id, queryable);

      await this.equipmentDataRepository.addEquipmentHistoryEntry(
        {
          id: randomUUID(),
          equipmentId: oldEquipment.id,
          occurredAt: new Date().toISOString(),
          actorName,
          kind: 'markedReplaced',
          message: `Marked removed and replaced by ${formatEquipmentLabel(replacementEquipment)}.`
        },
        queryable
      );

      await this.equipmentDataRepository.addEquipmentHistoryEntry(
        {
          id: randomUUID(),
          equipmentId: replacementEquipment.id,
          occurredAt: new Date().toISOString(),
          actorName,
          kind: 'replacementLinkChanged',
          message: `Linked as the replacement for ${formatEquipmentLabel(oldEquipment)}.`
        },
        queryable
      );
    });

    return {
      oldEquipment: await this.getEquipmentById(oldEquipmentId),
      replacementEquipment: await this.getEquipmentById(replacementEquipmentId)
    };
  }

  async deleteEquipment(equipmentId: string): Promise<void> {
    const existingEquipment = await this.getEquipmentById(equipmentId);
    await this.equipmentDataRepository.deleteEquipment(existingEquipment.id);
  }

  async getEquipmentHistory(equipmentId: string): Promise<EquipmentHistoryRecord[]> {
    await this.getEquipmentById(equipmentId);
    return this.equipmentDataRepository.listEquipmentHistory(equipmentId);
  }

  async getEquipmentGroupById(groupId: string): Promise<EquipmentGroupRecord | null> {
    return this.equipmentDataRepository.getEquipmentGroupById(groupId);
  }

  async getEquipmentById(equipmentId: string): Promise<EquipmentRecord> {
    const equipmentRecord = await this.equipmentDataRepository.getEquipmentById(equipmentId);

    if (!equipmentRecord) {
      throw new NotFoundException('Equipment record not found.');
    }

    return equipmentRecord;
  }

  private buildUpdateHistoryEntries(
    previousEquipment: EquipmentRecord,
    nextEquipment: EquipmentRecord,
    actorName: string,
    previousGroup: EquipmentGroupRecord | null,
    nextGroup: EquipmentGroupRecord | null
  ): EquipmentHistoryRecord[] {
    const occurredAt = nextEquipment.updatedAt;
    const entries: EquipmentHistoryRecord[] = [];

    if (previousEquipment.status !== nextEquipment.status) {
      entries.push({
        id: randomUUID(),
        equipmentId: nextEquipment.id,
        occurredAt,
        actorName,
        kind: 'statusChanged',
        message: `Status changed from ${formatEquipmentStatus(previousEquipment.status)} to ${formatEquipmentStatus(nextEquipment.status)}.`
      });
    }

    if (
      previousEquipment.locationId !== nextEquipment.locationId ||
      previousEquipment.inventoryLocationLabel !== nextEquipment.inventoryLocationLabel
    ) {
      entries.push({
        id: randomUUID(),
        equipmentId: nextEquipment.id,
        occurredAt,
        actorName,
        kind: 'placementChanged',
        message: `Placement changed to ${formatPlacementLabel(nextEquipment)}.`
      });
    }

    if (previousEquipment.systemGroupId !== nextEquipment.systemGroupId) {
      if (!previousGroup && nextGroup) {
        entries.push({
          id: randomUUID(),
          equipmentId: nextEquipment.id,
          occurredAt,
          actorName,
          kind: 'grouped',
          message: `Added to system group "${nextGroup.name}".`
        });
      } else if (previousGroup && !nextGroup) {
        entries.push({
          id: randomUUID(),
          equipmentId: nextEquipment.id,
          occurredAt,
          actorName,
          kind: 'ungrouped',
          message: `Removed from system group "${previousGroup.name}".`
        });
      } else if (previousGroup && nextGroup) {
        entries.push({
          id: randomUUID(),
          equipmentId: nextEquipment.id,
          occurredAt,
          actorName,
          kind: 'grouped',
          message: `System group changed from "${previousGroup.name}" to "${nextGroup.name}".`
        });
      }
    }

    const editedFields = collectEditedFields(previousEquipment, nextEquipment);

    if (editedFields.length > 0) {
      entries.push({
        id: randomUUID(),
        equipmentId: nextEquipment.id,
        occurredAt,
        actorName,
        kind: 'edited',
        message: `Updated equipment details: ${editedFields.join(', ')}.`
      });
    }

    return entries;
  }
}

function collectEditedFields(previousEquipment: EquipmentRecord, nextEquipment: EquipmentRecord): string[] {
  const changedFields: string[] = [];

  if (previousEquipment.equipmentType !== nextEquipment.equipmentType) {
    changedFields.push('type');
  }

  if (previousEquipment.brand !== nextEquipment.brand) {
    changedFields.push('brand');
  }

  if (previousEquipment.model !== nextEquipment.model) {
    changedFields.push('model');
  }

  if (previousEquipment.serialNumber !== nextEquipment.serialNumber) {
    changedFields.push('serial number');
  }

  if (previousEquipment.filterSizes.join('|') !== nextEquipment.filterSizes.join('|')) {
    changedFields.push('filter sizes');
  }

  if (previousEquipment.equipmentLocationDescription !== nextEquipment.equipmentLocationDescription) {
    changedFields.push('equipment location');
  }

  if (previousEquipment.installDate !== nextEquipment.installDate) {
    changedFields.push('install date');
  }

  if (previousEquipment.warrantyStartDate !== nextEquipment.warrantyStartDate) {
    changedFields.push('warranty start');
  }

  if (previousEquipment.warrantyEndDate !== nextEquipment.warrantyEndDate) {
    changedFields.push('warranty end');
  }

  if (previousEquipment.warrantyProviderNote !== nextEquipment.warrantyProviderNote) {
    changedFields.push('warranty note');
  }

  if (previousEquipment.notes !== nextEquipment.notes) {
    changedFields.push('notes');
  }

  return changedFields;
}

function formatPlacementLabel(equipment: EquipmentRecord): string {
  if (equipment.locationId) {
    return 'the service location';
  }

  return equipment.inventoryLocationLabel ? `inventory location "${equipment.inventoryLocationLabel}"` : 'inventory';
}

function formatEquipmentStatus(status: EquipmentRecord['status']): string {
  if (status === 'pendingInstall') {
    return 'pending install';
  }

  return status;
}

function formatEquipmentLabel(equipment: EquipmentRecord): string {
  const serialPart = equipment.serialNumber ? ` (${equipment.serialNumber})` : '';
  return `${equipment.brand} ${equipment.model}${serialPart}`;
}
