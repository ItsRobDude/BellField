import { FieldAgreementCoverageRepository } from './field-agreement-coverage.repository';

function createRepository(rowsByCall: unknown[][] = []) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const databaseService = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rows: rowsByCall[calls.length - 1] ?? [] };
    })
  };
  const repository = new FieldAgreementCoverageRepository(databaseService as never);

  return { calls, databaseService, repository };
}

describe('FieldAgreementCoverageRepository', () => {
  it('returns empty coverage without querying when there are no assigned locations', async () => {
    const { databaseService, repository } = createRepository();

    await expect(repository.listActiveCoverageForLocations([])).resolves.toEqual([]);

    expect(databaseService.query).not.toHaveBeenCalled();
  });

  it('scopes field coverage to active agreements and assigned locations', async () => {
    const { calls, repository } = createRepository([
      [
        {
          agreementId: 'agreement-1',
          agreementNumber: 'SA-1001',
          customerId: 'customer-1',
          customerName: 'Acme',
          name: 'Residential maintenance plan',
          description: 'Customer-facing coverage note',
          renewalDate: '2026-12-31'
        }
      ],
      [
        {
          agreementId: 'agreement-1',
          locationId: 'location-1',
          locationName: 'Main Shop'
        }
      ],
      [
        {
          agreementId: 'agreement-1',
          equipmentId: 'equipment-1',
          locationId: 'location-1',
          locationName: 'Main Shop',
          equipmentType: 'Condenser',
          brand: 'Carrier',
          model: '24ABC',
          serialNumber: 'SER-1'
        }
      ],
      [
        {
          agreementId: 'agreement-1',
          title: 'Spring maintenance',
          frequency: 'annual',
          intervalMonths: null,
          preferredMonth: null,
          preferredDayOfMonth: null,
          timeWindowLabel: 'Morning',
          jobType: null,
          category: null,
          summary: null,
          estimatedDurationMinutes: 90
        }
      ]
    ]);

    const result = await repository.listActiveCoverageForLocations(['location-1', 'location-1']);

    expect(calls).toHaveLength(4);
    expect(calls[0]?.sql).toContain("where agreement.status = 'active'");
    expect(calls[0]?.sql).toContain('scoped_location.location_id = any($1::text[])');
    expect(calls[0]?.params).toEqual([['location-1']]);
    expect(calls[1]?.params).toEqual([['agreement-1'], ['location-1']]);
    expect(calls[2]?.params).toEqual([['agreement-1'], ['location-1']]);
    expect(calls[3]?.sql).toContain('and is_active = true');
    expect(result).toEqual([
      {
        agreementId: 'agreement-1',
        agreementNumber: 'SA-1001',
        customerId: 'customer-1',
        customerName: 'Acme',
        name: 'Residential maintenance plan',
        description: 'Customer-facing coverage note',
        renewalDate: '2026-12-31',
        coveredLocations: [{ locationId: 'location-1', locationName: 'Main Shop' }],
        coveredEquipment: [
          {
            equipmentId: 'equipment-1',
            equipmentLabel: 'Condenser - Carrier 24ABC (SER-1)',
            locationId: 'location-1',
            locationName: 'Main Shop'
          }
        ],
        activeVisitTemplates: [
          {
            title: 'Spring maintenance',
            frequency: 'annual',
            timeWindowLabel: 'Morning',
            estimatedDurationMinutes: 90
          }
        ]
      }
    ]);
  });
});
