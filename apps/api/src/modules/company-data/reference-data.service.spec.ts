import type { ContactMethodRecord } from './company-data.types';
import type { CrmOperationalDataRepository } from './crm-operational-data.repository';
import type { ReferenceDataRepository } from './reference-data.repository';
import { ReferenceDataService } from './reference-data.service';

function buildContactMethod(overrides: Partial<ContactMethodRecord> = {}): ContactMethodRecord {
  return {
    id: 'method-1',
    ownerKind: 'location',
    ownerId: 'location-1',
    kind: 'phone',
    label: 'Main',
    value: '360-555-0100',
    isPrimary: true,
    isActive: true,
    ...overrides
  };
}

function createService(input: {
  updatedMethod: ContactMethodRecord;
  methodsAfterUpdate: ContactMethodRecord[];
}) {
  const repository = {
    updateContactMethod: jest.fn(async () => input.updatedMethod),
    listLocationContactMethods: jest.fn(async () => input.methodsAfterUpdate),
    updateLegacyContactValue: jest.fn(async () => undefined)
  } as unknown as jest.Mocked<ReferenceDataRepository>;

  const operationalRepository = {} as unknown as CrmOperationalDataRepository;
  const service = new ReferenceDataService(repository, operationalRepository);

  return { repository, service };
}

describe('ReferenceDataService contact method syncing', () => {
  it('syncs an active primary contact method into the legacy contact cache', async () => {
    const updatedMethod = buildContactMethod({ value: '360-555-0188' });
    const { repository, service } = createService({
      updatedMethod,
      methodsAfterUpdate: [updatedMethod]
    });

    await service.updateContactMethod('method-1', { value: '360-555-0188' });

    expect(repository.updateLegacyContactValue).toHaveBeenCalledWith(
      'location',
      'location-1',
      'phone',
      '360-555-0188'
    );
  });

  it('clears the legacy contact cache when the active primary method is archived', async () => {
    const archivedMethod = buildContactMethod({ isActive: false, endedAt: '2026-06-06' });
    const { repository, service } = createService({
      updatedMethod: archivedMethod,
      methodsAfterUpdate: [archivedMethod]
    });

    await service.updateContactMethod('method-1', { isActive: false });

    expect(repository.updateLegacyContactValue).toHaveBeenCalledWith(
      'location',
      'location-1',
      'phone',
      null
    );
  });

  it('clears the legacy contact cache when the primary method is demoted', async () => {
    const demotedMethod = buildContactMethod({ isPrimary: false });
    const { repository, service } = createService({
      updatedMethod: demotedMethod,
      methodsAfterUpdate: [demotedMethod]
    });

    await service.updateContactMethod('method-1', { isPrimary: false });

    expect(repository.updateLegacyContactValue).toHaveBeenCalledWith(
      'location',
      'location-1',
      'phone',
      null
    );
  });
});
