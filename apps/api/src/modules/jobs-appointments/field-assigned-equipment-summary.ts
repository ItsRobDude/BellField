import type { EquipmentSummary } from '@bellfield/contracts';
import type { EquipmentDataService } from '../company-data/equipment-data.service';

export async function listAssignedEquipmentSummaries(
  equipmentDataService: EquipmentDataService,
  locationIds: string[]
): Promise<EquipmentSummary[]> {
  const scopedLocationIds = new Set(locationIds);
  const equipment = await equipmentDataService.listEquipment(true);

  return Promise.all(
    equipment
      .filter(
        (equipmentRecord) =>
          equipmentRecord.locationId && scopedLocationIds.has(equipmentRecord.locationId)
      )
      .map(async (equipmentRecord) => {
        const equipmentGroup = equipmentRecord.systemGroupId
          ? await equipmentDataService.getEquipmentGroupById(equipmentRecord.systemGroupId)
          : null;
        const age = deriveEquipmentAge(equipmentRecord.installDate);

        return {
          id: equipmentRecord.id,
          locationId: equipmentRecord.locationId,
          inventoryLocationLabel: equipmentRecord.inventoryLocationLabel,
          equipmentType: equipmentRecord.equipmentType,
          brand: equipmentRecord.brand,
          model: equipmentRecord.model,
          serialNumber: equipmentRecord.serialNumber,
          filterSizes: [...equipmentRecord.filterSizes],
          equipmentLocationDescription: equipmentRecord.equipmentLocationDescription,
          installDate: equipmentRecord.installDate,
          warrantyStartDate: equipmentRecord.warrantyStartDate,
          warrantyEndDate: equipmentRecord.warrantyEndDate,
          warrantyProviderNote: equipmentRecord.warrantyProviderNote,
          status: equipmentRecord.status,
          ageYears: age.ageYears,
          ageLabel: age.ageLabel,
          systemGroup: equipmentGroup
            ? { id: equipmentGroup.id, name: equipmentGroup.name }
            : undefined,
          replacesEquipmentId: equipmentRecord.replacesEquipmentId,
          replacedByEquipmentId: equipmentRecord.replacedByEquipmentId,
          notes: equipmentRecord.notes,
          updatedAt: equipmentRecord.updatedAt
        };
      })
  );
}

function deriveEquipmentAge(installDate?: string): { ageYears?: number; ageLabel?: string } {
  if (!installDate) {
    return {};
  }

  const installedAt = new Date(`${installDate}T00:00:00.000Z`);

  if (Number.isNaN(installedAt.getTime())) {
    return {};
  }

  const now = new Date();
  let ageYears = now.getUTCFullYear() - installedAt.getUTCFullYear();
  const monthOffset = now.getUTCMonth() - installedAt.getUTCMonth();
  const dayOffset = now.getUTCDate() - installedAt.getUTCDate();

  if (monthOffset < 0 || (monthOffset === 0 && dayOffset < 0)) {
    ageYears -= 1;
  }

  if (ageYears < 0) {
    return {};
  }

  return {
    ageYears,
    ageLabel: ageYears === 0 ? 'Less than 1 year' : ageYears === 1 ? '1 year' : `${ageYears} years`
  };
}
