import { CrmOperationalDataRepository } from './crm-operational-data.repository';

function createRepository(rowsByQuery: unknown[][]) {
  const databaseService = {
    query: jest.fn(async (_sql: string, _params?: unknown[]) => ({
      rows: rowsByQuery.shift() ?? []
    }))
  };

  return {
    databaseService,
    repository: new CrmOperationalDataRepository(databaseService as never)
  };
}

describe('CrmOperationalDataRepository', () => {
  it('builds location operational context from service records', async () => {
    const { databaseService, repository } = createRepository([
      [
        {
          openJobCount: '1',
          lastServiceAt: '2026-06-01',
          equipmentCount: '2',
          appointmentCount: '3',
          invoiceCount: '1',
          estimateCount: '1'
        }
      ],
      [
        {
          id: 'job-1',
          jobNumber: '1001',
          locationId: 'location-1',
          locationName: 'Main Shop',
          billToCustomerId: 'customer-1',
          billToCustomerName: 'Acme',
          jobType: 'Service',
          category: 'General',
          origin: 'Inbound',
          summary: 'No cooling',
          status: 'scheduled',
          workOrderNumber: null,
          appointmentCount: '1',
          nextAppointmentId: 'appointment-1',
          nextAppointmentJobId: 'job-1',
          nextAppointmentJobNumber: '1001',
          nextAppointmentScheduledDate: '2026-06-03',
          nextAppointmentScheduledStartTime: '13:00',
          nextAppointmentScheduledEndTime: '15:00',
          nextAppointmentTimeWindowLabel: '1 PM - 3 PM',
          nextAppointmentTechnicianName: 'Taylor Tech',
          nextAppointmentStatus: 'confirmed',
          nextAppointmentCreatedAt: '2026-06-01T10:00:00.000Z',
          nextAppointmentUpdatedAt: '2026-06-01T10:00:00.000Z',
          createdAt: '2026-06-01T09:00:00.000Z',
          updatedAt: '2026-06-01T10:00:00.000Z'
        }
      ],
      [
        {
          id: 'appointment-1',
          jobId: 'job-1',
          jobNumber: '1001',
          scheduledDate: '2026-06-03',
          scheduledStartTime: '13:00',
          scheduledEndTime: '15:00',
          timeWindowLabel: '1 PM - 3 PM',
          technicianName: 'Taylor Tech',
          status: 'confirmed',
          createdAt: '2026-06-01T10:00:00.000Z',
          updatedAt: '2026-06-01T10:00:00.000Z'
        }
      ],
      [
        {
          id: 'invoice-1',
          jobId: 'job-1',
          jobNumber: '1001',
          invoiceKind: 'main',
          status: 'draft',
          total: '125.50',
          costComplete: true,
          postedAt: null,
          createdAt: '2026-06-01T10:00:00.000Z',
          updatedAt: '2026-06-01T10:00:00.000Z'
        }
      ],
      [
        {
          id: 'estimate-1',
          jobId: 'job-1',
          jobNumber: '1001',
          status: 'pending',
          title: 'Replace capacitor',
          total: '225.00',
          costComplete: false,
          validUntil: '2026-06-30',
          createdAt: '2026-06-01T10:00:00.000Z',
          updatedAt: '2026-06-01T10:00:00.000Z'
        }
      ],
      [
        {
          id: 'equipment-1',
          locationId: 'location-1',
          locationName: 'Main Shop',
          equipmentType: 'Condenser',
          brand: 'Carrier',
          model: 'ABC',
          serialNumber: 'SN1',
          status: 'active',
          installDate: '2025-01-01',
          updatedAt: '2026-06-01T10:00:00.000Z'
        }
      ],
      [
        {
          id: 'timeline-1',
          kind: 'job',
          occurredAt: '2026-06-01T10:00:00.000Z',
          title: 'Job scheduled.',
          detail: 'Job 1001',
          jobId: 'job-1',
          jobNumber: '1001',
          locationId: 'location-1',
          locationName: 'Main Shop',
          actorName: 'Olivia Owner'
        },
        {
          id: 'contact-link-1',
          kind: 'contact',
          occurredAt: '2026-06-01T11:00:00.000Z',
          title: 'Contact linked: Casey Parker',
          detail: 'Primary',
          jobId: null,
          jobNumber: null,
          locationId: 'location-1',
          locationName: 'Main Shop',
          actorName: null
        }
      ]
    ]);

    const context = await repository.getLocationOperationalContext('location-1');

    expect(databaseService.query).toHaveBeenCalledTimes(7);
    expect(databaseService.query.mock.calls[1]?.[1]).toEqual(['location-1', 25]);
    expect(context.summary).toEqual({
      openJobCount: 1,
      lastServiceAt: '2026-06-01',
      equipmentCount: 2,
      appointmentCount: 3,
      invoiceCount: 1,
      estimateCount: 1,
      activeAgreementCount: 0,
      endedAgreementCount: 0
    });
    expect(context.agreements).toEqual([]);
    expect(context.jobs[0]).toMatchObject({
      id: 'job-1',
      jobNumber: '1001',
      nextAppointment: expect.objectContaining({
        id: 'appointment-1',
        technicianName: 'Taylor Tech'
      })
    });
    expect(context.invoices[0]).toMatchObject({ id: 'invoice-1', total: 125.5 });
    expect(context.estimates[0]).toMatchObject({ id: 'estimate-1', costComplete: false });
    expect(context.equipment[0]).toMatchObject({ id: 'equipment-1', serialNumber: 'SN1' });
    expect(context.activity[0]).toMatchObject({ title: 'Job scheduled.', jobNumber: '1001' });
    expect(context.activity[1]).toMatchObject({
      kind: 'contact',
      title: 'Contact linked: Casey Parker'
    });
    expect(
      databaseService.query.mock.calls.some(([sql]) =>
        String(sql).includes('from location_contact_links link')
      )
    ).toBe(true);
  });

  it('scopes customer jobs by current owner or job bill-to customer', async () => {
    const { databaseService, repository } = createRepository([[{}], [], [], [], [], [], []]);

    await repository.getCustomerOperationalContext('customer-1');

    const jobQuery = String(databaseService.query.mock.calls[1]?.[0] ?? '');
    expect(jobQuery).toContain('location.customer_id = $1 or job.bill_to_customer_id = $1');
    expect(
      databaseService.query.mock.calls.some(([sql]) =>
        String(sql).includes('from customer_contact_links link')
      )
    ).toBe(true);
  });

  it('includes active and ended location agreements when agreement context is requested', async () => {
    const { databaseService, repository } = createRepository([
      [
        {
          openJobCount: '0',
          lastServiceAt: null,
          equipmentCount: '0',
          appointmentCount: '0',
          invoiceCount: '0',
          estimateCount: '0'
        }
      ],
      [],
      [],
      [
        {
          id: 'agreement-1',
          agreementNumber: 'SA-1001',
          customerId: 'customer-1',
          customerName: 'Acme',
          name: 'Annual maintenance plan',
          status: 'active',
          startDate: '2026-01-01',
          endDate: null,
          renewalDate: '2027-01-01',
          billingCadence: 'annual',
          nextBillingDate: '2027-01-01',
          billingAmount: '240.00',
          coveredLocationNames: ['Main Shop'],
          coveredEquipmentCount: '2',
          activeVisitTemplateCount: '1',
          updatedAt: '2026-06-01T10:00:00.000Z'
        },
        {
          id: 'agreement-2',
          agreementNumber: 'SA-1002',
          customerId: 'customer-1',
          customerName: 'Acme',
          name: 'Legacy maintenance plan',
          status: 'ended',
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          renewalDate: null,
          billingCadence: 'none',
          nextBillingDate: null,
          billingAmount: null,
          coveredLocationNames: ['Main Shop'],
          coveredEquipmentCount: '0',
          activeVisitTemplateCount: '0',
          updatedAt: '2025-12-31T10:00:00.000Z'
        }
      ],
      []
    ]);

    const context = await repository.getLocationOperationalContext('location-1', {
      includeAgreementContext: true
    });

    expect(databaseService.query).toHaveBeenCalledTimes(5);
    expect(context.summary).toMatchObject({ activeAgreementCount: 1, endedAgreementCount: 1 });
    expect(context.agreements).toEqual([
      expect.objectContaining({
        id: 'agreement-1',
        agreementNumber: 'SA-1001',
        status: 'active',
        billingAmount: 240,
        coveredLocationNames: ['Main Shop'],
        coveredEquipmentCount: 2,
        activeVisitTemplateCount: 1
      }),
      expect.objectContaining({
        id: 'agreement-2',
        agreementNumber: 'SA-1002',
        status: 'ended',
        billingAmount: undefined
      })
    ]);
    const agreementQuery = String(databaseService.query.mock.calls[3]?.[0] ?? '');
    expect(agreementQuery).toContain('from service_agreements agreement');
    expect(agreementQuery).toContain('scoped_acl.location_id = $1');
    expect(databaseService.query.mock.calls[3]?.[1]).toEqual(['location-1', 25]);
  });
});
