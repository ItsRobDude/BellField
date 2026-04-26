import { ReferenceDataRepository } from './reference-data.repository';

describe('ReferenceDataRepository', () => {
  it('returns the existing customer contact link id when a duplicate link is upserted', async () => {
    const databaseService = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('insert into customer_contact_links')) {
          return { rows: [{ id: 'existing-link-1' }] };
        }

        if (sql.includes('from customer_contact_links')) {
          return {
            rows: [
              {
                id: 'existing-link-1',
                contactId: 'contact-1',
                linkedRecordId: 'customer-1',
                phone: null,
                email: null,
                fax: null,
                tags: ['billing'],
                isActive: true,
                endDate: null
              }
            ]
          };
        }

        return { rows: [] };
      })
    };
    const repository = new ReferenceDataRepository(databaseService as never);

    const link = await repository.createContactLink({
      contactId: 'contact-1',
      linkedRecordId: 'customer-1',
      linkedRecordKind: 'customer',
      tags: ['billing'],
      isActive: true
    });

    expect(link).toEqual(
      expect.objectContaining({
        id: 'existing-link-1',
        contactId: 'contact-1',
        linkedRecordId: 'customer-1',
        linkedRecordKind: 'customer',
        tags: ['billing']
      })
    );
  });

  it('returns the existing location contact link id when a duplicate link is upserted', async () => {
    const databaseService = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('insert into location_contact_links')) {
          return { rows: [{ id: 'existing-link-2' }] };
        }

        if (sql.includes('from customer_contact_links')) {
          return { rows: [] };
        }

        if (sql.includes('from location_contact_links')) {
          return {
            rows: [
              {
                id: 'existing-link-2',
                contactId: 'contact-1',
                linkedRecordId: 'location-1',
                phone: null,
                email: null,
                fax: null,
                tags: ['site'],
                isActive: true,
                endDate: null
              }
            ]
          };
        }

        return { rows: [] };
      })
    };
    const repository = new ReferenceDataRepository(databaseService as never);

    const link = await repository.createContactLink({
      contactId: 'contact-1',
      linkedRecordId: 'location-1',
      linkedRecordKind: 'location',
      tags: ['site'],
      isActive: true
    });

    expect(link).toEqual(
      expect.objectContaining({
        id: 'existing-link-2',
        contactId: 'contact-1',
        linkedRecordId: 'location-1',
        linkedRecordKind: 'location',
        tags: ['site']
      })
    );
  });
});
