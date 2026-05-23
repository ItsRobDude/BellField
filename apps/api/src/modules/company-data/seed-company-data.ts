import type {
  AppointmentRecord,
  ContactLinkRecord,
  ContactRecord,
  CustomerAccountRecord,
  EquipmentGroupRecord,
  EquipmentHistoryRecord,
  EquipmentRecord,
  JobRecord,
  LocationRecord,
  OwnershipHistoryRecord
} from './company-data.types';

export const seededCustomers: CustomerAccountRecord[] = [
  {
    id: 'customer-residential-1',
    name: 'Jordan and Casey Parker',
    accountType: 'residential',
    isActive: true,
    billingAddressLine1: '214 Cedar Avenue',
    billingCity: 'Everett',
    billingState: 'WA',
    billingPostalCode: '98201',
    phone: '(555) 201-1100',
    email: 'parker@example.local',
    flags: []
  },
  {
    id: 'customer-property-manager-1',
    name: 'Redwood Property Management',
    accountType: 'propertyManager',
    isActive: true,
    billingAddressLine1: '901 First Avenue',
    billingCity: 'Seattle',
    billingState: 'WA',
    billingPostalCode: '98104',
    phone: '(555) 201-2200',
    email: 'service@redwoodpm.local',
    flags: []
  },
  {
    id: 'customer-company-1',
    name: 'Sunrise Dental Group',
    accountType: 'company',
    isActive: true,
    billingAddressLine1: '455 Pine Street',
    billingCity: 'Lynnwood',
    billingState: 'WA',
    billingPostalCode: '98036',
    phone: '(555) 201-3300',
    email: 'office@sunrisedental.local',
    flags: ['Do Not Service after hours without manager approval']
  },
  {
    id: 'customer-landlord-1',
    name: 'Morgan Rentals',
    accountType: 'landlord',
    isActive: true,
    billingAddressLine1: '18 Railroad Avenue',
    billingCity: 'Bellingham',
    billingState: 'WA',
    billingPostalCode: '98225',
    phone: '(555) 201-4400',
    email: 'repairs@morganrentals.local',
    flags: []
  }
];

export const seededContacts: ContactRecord[] = [
  {
    id: 'contact-location-1',
    displayName: 'Casey Parker',
    phone: '(555) 201-1101',
    email: 'casey.parker@example.local',
    fax: undefined,
    tags: ['Primary'],
    isActive: true
  },
  {
    id: 'contact-location-2',
    displayName: 'Avery Leasing Office',
    phone: '(555) 201-2201',
    email: 'leasing@redwoodpm.local',
    fax: undefined,
    tags: ['Primary', 'Billing'],
    isActive: true
  },
  {
    id: 'contact-location-3',
    displayName: 'Dr. Taylor Nguyen',
    phone: '(555) 201-3301',
    email: 'ops@sunrisedental.local',
    fax: undefined,
    tags: ['Primary'],
    isActive: true
  }
];

export const seededLocations: LocationRecord[] = [
  {
    id: 'location-parkers-home',
    name: 'Parker Residence',
    customerId: 'customer-residential-1',
    addressLine1: '214 Cedar Avenue',
    city: 'Everett',
    state: 'WA',
    postalCode: '98201',
    phone: '(555) 201-1101',
    email: 'casey.parker@example.local',
    fax: undefined,
    isActive: true,
    alternateBillToCustomerIds: ['customer-landlord-1'],
  },
  {
    id: 'location-redwood-unit-12',
    name: 'Redwood Apartments Unit 12',
    customerId: 'customer-property-manager-1',
    addressLine1: '88 Harbor View Drive',
    city: 'Mukilteo',
    state: 'WA',
    postalCode: '98275',
    phone: '(555) 201-2201',
    email: 'leasing@redwoodpm.local',
    fax: undefined,
    isActive: true,
    alternateBillToCustomerIds: ['customer-landlord-1'],
  },
  {
    id: 'location-sunrise-dental',
    name: 'Sunrise Dental Clinic',
    customerId: 'customer-company-1',
    addressLine1: '455 Pine Street',
    city: 'Lynnwood',
    state: 'WA',
    postalCode: '98036',
    phone: '(555) 201-3301',
    email: 'ops@sunrisedental.local',
    fax: undefined,
    isActive: true,
    alternateBillToCustomerIds: [],
  }
];

export const seededLocationContactLinks: ContactLinkRecord[] = [
  {
    id: 'location-parkers-home--contact-location-1',
    contactId: 'contact-location-1',
    linkedRecordId: 'location-parkers-home',
    linkedRecordKind: 'location',
    tags: ['Primary'],
    isActive: true
  },
  {
    id: 'location-redwood-unit-12--contact-location-2',
    contactId: 'contact-location-2',
    linkedRecordId: 'location-redwood-unit-12',
    linkedRecordKind: 'location',
    tags: ['Primary', 'Billing'],
    isActive: true
  },
  {
    id: 'location-sunrise-dental--contact-location-3',
    contactId: 'contact-location-3',
    linkedRecordId: 'location-sunrise-dental',
    linkedRecordKind: 'location',
    tags: ['Primary'],
    isActive: true
  }
];

export const seededLocationOwnershipHistory: OwnershipHistoryRecord[] = [
  {
    id: 'location-parkers-home--owner-1',
    locationId: 'location-parkers-home',
    customerId: 'customer-residential-1',
    startedAt: '2026-04-13T15:00:00.000Z',
    note: 'Location remained active after prior ownership transfer to the Parker family.'
  },
  {
    id: 'location-redwood-unit-12--owner-1',
    locationId: 'location-redwood-unit-12',
    customerId: 'customer-property-manager-1',
    startedAt: '2026-04-13T15:00:00.000Z',
    note: 'Main billing customer moved from landlord to property manager in 2025.'
  },
  {
    id: 'location-sunrise-dental--owner-1',
    locationId: 'location-sunrise-dental',
    customerId: 'customer-company-1',
    startedAt: '2026-04-13T15:00:00.000Z',
    note: 'Commercial rooftop units tracked separately from office split systems.'
  }
];

const baseTimestamp = '2026-04-13T16:00:00.000Z';

export const seededEquipment: EquipmentRecord[] = [
  {
    id: 'equipment-condensing-unit-1',
    locationId: 'location-parkers-home',
    equipmentType: 'Condenser',
    brand: 'Carrier',
    model: '24ABC636A003',
    serialNumber: 'CA3X89012',
    filterSizes: ['16x25x1'],
    equipmentLocationDescription: 'Right side yard pad',
    installDate: '2020-08-14',
    warrantyStartDate: '2020-08-14',
    warrantyEndDate: '2030-08-14',
    warrantyProviderNote: 'Carrier 10-year registered parts warranty',
    systemGroupId: 'equipment-group-parkers-main-system',
    status: 'active',
    notes: 'Outdoor unit with visible hail wear on top panel.',
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp
  },
  {
    id: 'equipment-furnace-1',
    locationId: 'location-parkers-home',
    equipmentType: 'Gas Furnace',
    brand: 'Carrier',
    model: '58SB0A070E141112',
    serialNumber: 'FN4Z55120',
    filterSizes: ['16x25x1', '20x20x1'],
    equipmentLocationDescription: 'Garage closet',
    installDate: '2020-08-14',
    warrantyStartDate: '2020-08-14',
    warrantyEndDate: '2030-08-14',
    warrantyProviderNote: 'Carrier 10-year registered parts warranty',
    systemGroupId: 'equipment-group-parkers-main-system',
    status: 'active',
    notes: 'Blower wheel was cleaned during last maintenance visit.',
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp
  },
  {
    id: 'equipment-package-unit-1',
    locationId: 'location-sunrise-dental',
    equipmentType: 'Package Unit',
    brand: 'Trane',
    model: 'YSC060G3RLA',
    serialNumber: 'PK6Z22011',
    filterSizes: ['20x25x2'],
    equipmentLocationDescription: 'Roof section B',
    installDate: '2018-03-09',
    warrantyProviderNote: 'Warranty status unknown',
    systemGroupId: 'equipment-group-sunrise-roof-b',
    status: 'active',
    notes: 'Economizer damper occasionally sticks during cold mornings.',
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp
  },
  {
    id: 'equipment-air-handler-1',
    locationId: 'location-redwood-unit-12',
    equipmentType: 'Air Handler',
    brand: 'Goodman',
    model: 'ARUF37C14',
    serialNumber: 'AH7M99218',
    filterSizes: ['14x20x1'],
    equipmentLocationDescription: 'Hall closet',
    installDate: '2017-06-11',
    warrantyProviderNote: 'Pending install replacement air handler',
    systemGroupId: 'equipment-group-redwood-hall-system',
    status: 'pendingInstall',
    notes: 'Replacement air handler received before scheduled install visit.',
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp
  }
];

export const seededEquipmentGroups: EquipmentGroupRecord[] = [
  {
    id: 'equipment-group-parkers-main-system',
    name: 'Main House System',
    locationId: 'location-parkers-home',
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp
  },
  {
    id: 'equipment-group-sunrise-roof-b',
    name: 'Roof Section B',
    locationId: 'location-sunrise-dental',
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp
  },
  {
    id: 'equipment-group-redwood-hall-system',
    name: 'Hall Closet System',
    locationId: 'location-redwood-unit-12',
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp
  }
];

export const seededEquipmentHistory: EquipmentHistoryRecord[] = [
  {
    id: 'equipment-condensing-unit-1--history-created',
    equipmentId: 'equipment-condensing-unit-1',
    occurredAt: baseTimestamp,
    actorName: 'BellField bootstrap',
    kind: 'created',
    message: 'Equipment record created.'
  },
  {
    id: 'equipment-furnace-1--history-created',
    equipmentId: 'equipment-furnace-1',
    occurredAt: baseTimestamp,
    actorName: 'BellField bootstrap',
    kind: 'created',
    message: 'Equipment record created.'
  },
  {
    id: 'equipment-package-unit-1--history-created',
    equipmentId: 'equipment-package-unit-1',
    occurredAt: baseTimestamp,
    actorName: 'BellField bootstrap',
    kind: 'created',
    message: 'Equipment record created.'
  },
  {
    id: 'equipment-air-handler-1--history-created',
    equipmentId: 'equipment-air-handler-1',
    occurredAt: baseTimestamp,
    actorName: 'BellField bootstrap',
    kind: 'created',
    message: 'Equipment record created.'
  }
];

export const seededJobs: JobRecord[] = [
  {
    id: 'job-service-1001',
    jobNumber: '1001',
    locationId: 'location-parkers-home',
    billToCustomerId: 'customer-residential-1',
    jobType: 'Cooling Service',
    category: 'Service',
    origin: 'Inbound phone call',
    summary: 'Cooling not keeping up during afternoon heat.',
    status: 'scheduled',
    workOrderNumber: 'WO-1001',
    appointmentIds: ['appointment-1001-a'],
    timeline: [
      {
        id: 'timeline-1001-created',
        occurredAt: '2026-04-13T15:15:00.000Z',
        actorName: 'Casey CSR',
        kind: 'jobCreated',
        message: 'Job created from inbound phone call and scheduled for today.'
      }
    ],
    createdAt: '2026-04-13T15:15:00.000Z',
    updatedAt: '2026-04-13T15:15:00.000Z'
  },
  {
    id: 'job-service-1002',
    jobNumber: '1002',
    locationId: 'location-sunrise-dental',
    billToCustomerId: 'customer-company-1',
    jobType: 'Maintenance',
    category: 'Commercial',
    origin: 'PM contract reminder',
    summary: 'Quarterly rooftop maintenance and airflow inspection.',
    status: 'inProgress',
    workOrderNumber: 'WO-1002',
    appointmentIds: ['appointment-1002-a', 'appointment-1002-b'],
    timeline: [
      {
        id: 'timeline-1002-created',
        occurredAt: '2026-04-12T18:00:00.000Z',
        actorName: 'Dylan Dispatcher',
        kind: 'jobCreated',
        message: 'Job created from PM reminder and split into two rooftop visits.'
      }
    ],
    createdAt: '2026-04-12T18:00:00.000Z',
    updatedAt: '2026-04-12T18:00:00.000Z'
  }
];

export const seededAppointments: AppointmentRecord[] = [
  {
    id: 'appointment-1001-a',
    jobId: 'job-service-1001',
    scheduledDate: '2026-04-13',
    scheduledStartTime: '13:00',
    scheduledEndTime: '15:00',
    timeWindowLabel: '1:00 PM - 3:00 PM',
    technicianId: 'employee-technician-1',
    status: 'scheduled',
    createdAt: '2026-04-13T15:15:00.000Z',
    updatedAt: '2026-04-13T15:15:00.000Z'
  },
  {
    id: 'appointment-1002-a',
    jobId: 'job-service-1002',
    scheduledDate: '2026-04-13',
    scheduledStartTime: '08:00',
    scheduledEndTime: '10:00',
    timeWindowLabel: '8:00 AM - 10:00 AM',
    technicianId: 'employee-technician-1',
    status: 'working',
    finishOutcome: undefined,
    visitNotes: undefined,
    hasChargeActivity: undefined,
    registerFollowUpNote: undefined,
    createdAt: '2026-04-12T18:00:00.000Z',
    updatedAt: '2026-04-13T15:40:00.000Z'
  },
  {
    id: 'appointment-1002-b',
    jobId: 'job-service-1002',
    scheduledDate: '2026-04-14',
    scheduledStartTime: '09:00',
    scheduledEndTime: '11:00',
    timeWindowLabel: '9:00 AM - 11:00 AM',
    technicianId: 'employee-technician-1',
    status: 'scheduled',
    createdAt: '2026-04-12T18:02:00.000Z',
    updatedAt: '2026-04-12T18:02:00.000Z'
  }
];
