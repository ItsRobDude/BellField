import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  DispatchAppointmentRecord,
  EquipmentRecord
} from '../company-data/company-data.types';
import { EquipmentDataService } from '../company-data/equipment-data.service';
import { JobsDataService } from '../company-data/jobs-data.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import type {
  DispatchAppointmentSummaryDto,
  DispatchBoardResponseDto,
  DispatchEquipmentGlanceDto
} from './dispatch.types';

const maxDispatchRangeDays = 31;
const equipmentGlanceLimit = 3;

@Injectable()
export class DispatchService {
  constructor(
    private readonly jobsDataService: JobsDataService,
    private readonly equipmentDataService: EquipmentDataService,
    private readonly identityAccessService: IdentityAccessService
  ) {}

  async getDispatchBoard(
    sessionToken: string,
    startDate: string | undefined,
    endDate: string | undefined
  ): Promise<DispatchBoardResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'appointmentsDispatch:view',
      ['office-web']
    );
    const dateRange = this.parseDateRange(startDate, endDate);
    const appointments = await this.jobsDataService.listDispatchAppointments(
      dateRange.startDate,
      dateRange.endDate
    );
    const locationIds = [...new Set(appointments.map((appointment) => appointment.locationId))];
    const [technicians, equipment] = await Promise.all([
      this.identityAccessService.getActiveEmployees(),
      this.equipmentDataService.listEquipmentByLocations(locationIds, false)
    ]);
    const equipmentByLocation = this.groupEquipmentByLocation(equipment);

    return {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      technicians: technicians
        .filter((employee) => employee.roleId === 'technician')
        .map((employee) => ({
          id: employee.id,
          displayName: employee.displayName,
          roleId: employee.roleId
        })),
      appointments: appointments.map((appointment) =>
        this.toDispatchAppointmentSummary(
          appointment,
          equipmentByLocation.get(appointment.locationId) ?? []
        )
      )
    };
  }

  private parseDateRange(
    startDate: string | undefined,
    endDate: string | undefined
  ): { startDate: string; endDate: string } {
    const parsedStart = this.parseDate(startDate, 'startDate');
    const parsedEnd = this.parseDate(endDate ?? startDate, 'endDate');

    if (parsedEnd.epochDay < parsedStart.epochDay) {
      throw new BadRequestException('endDate must be on or after startDate.');
    }

    if (parsedEnd.epochDay - parsedStart.epochDay + 1 > maxDispatchRangeDays) {
      throw new BadRequestException(
        `Dispatch date range cannot exceed ${maxDispatchRangeDays} days.`
      );
    }

    return {
      startDate: parsedStart.value,
      endDate: parsedEnd.value
    };
  }

  private parseDate(
    value: string | undefined,
    fieldName: string
  ): { value: string; epochDay: number } {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${fieldName} must be a YYYY-MM-DD date.`);
    }

    const [yearText, monthText, dayText] = value.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const time = Date.UTC(year, month - 1, day);
    const parsed = new Date(time);

    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw new BadRequestException(`${fieldName} must be a valid calendar date.`);
    }

    return {
      value,
      epochDay: Math.floor(time / 86_400_000)
    };
  }

  private groupEquipmentByLocation(equipment: EquipmentRecord[]): Map<string, EquipmentRecord[]> {
    const equipmentByLocation = new Map<string, EquipmentRecord[]>();

    for (const equipmentRecord of equipment) {
      if (!equipmentRecord.locationId) {
        continue;
      }

      equipmentByLocation.set(equipmentRecord.locationId, [
        ...(equipmentByLocation.get(equipmentRecord.locationId) ?? []),
        equipmentRecord
      ]);
    }

    return equipmentByLocation;
  }

  private toDispatchAppointmentSummary(
    appointment: DispatchAppointmentRecord,
    locationEquipment: EquipmentRecord[]
  ): DispatchAppointmentSummaryDto {
    return {
      ...appointment,
      equipment: locationEquipment
        .slice(0, equipmentGlanceLimit)
        .map((equipment) => this.toEquipmentGlance(equipment)),
      equipmentCount: locationEquipment.length
    };
  }

  private toEquipmentGlance(equipment: EquipmentRecord): DispatchEquipmentGlanceDto {
    return {
      id: equipment.id,
      equipmentType: equipment.equipmentType,
      brand: equipment.brand,
      model: equipment.model,
      serialNumber: equipment.serialNumber,
      filterSizes: [...equipment.filterSizes],
      installDate: equipment.installDate,
      status: equipment.status
    };
  }
}
