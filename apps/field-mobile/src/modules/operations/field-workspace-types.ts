import type { FieldAssignedWorkResponse } from '@/lib/operations-api';

export type FieldJob = FieldAssignedWorkResponse['jobs'][number];
export type FieldEquipmentRecord = FieldAssignedWorkResponse['equipment'][number];
export type FieldAgreementCoverage = FieldAssignedWorkResponse['agreementCoverage'][number];
export type FieldLocation = FieldAssignedWorkResponse['locations'][number];
export type FieldCustomer = FieldAssignedWorkResponse['customers'][number];
export type FieldAppointment = FieldJob['appointments'][number];
export type FieldRegisterEntry = NonNullable<FieldJob['registerEntries']>[number];
