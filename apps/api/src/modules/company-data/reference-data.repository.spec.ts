import { ReferenceDataRepository } from './reference-data.repository';

describe('ReferenceDataRepository', () => {
  it('searches CRM records with one bounded SQL query and maps result fields', async () => {
    const databaseService = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({
        rows: [
          {
            id: 'location-1',
            kind: 'location',
            title: 'Acme Shop',
            subtitle: '100 Main Street, Seattle, WA 98101',
            badges: ['Inactive'],
            phone: '(555) 111-2222',
            addressLine1: '100 Main Street',
            city: 'Seattle',
            state: 'WA',
            postalCode: '98101',
            customerId: 'customer-1',
            customerName: 'Acme Heating',
            isActive: false,
            score: '75'
          }
        ]
      }))
    };
    const repository = new ReferenceDataRepository(databaseService as never);

    const results = await repository.searchCrm(' Acme ', 25);
    const sql = String(databaseService.query.mock.calls[0]?.[0] ?? '');

    expect(databaseService.query).toHaveBeenCalledTimes(1);
    expect(databaseService.query.mock.calls[0]?.[1]).toEqual(['acme', 'acme', '', 25]);
    expect(sql).toContain('customer_matches');
    expect(sql).toContain('location_matches');
    expect(sql).toContain('contact_matches');
    expect(sql).toContain('limit $4');
    expect(sql).not.toContain('select * from customers');
    expect(results).toEqual([
      {
        id: 'location-1',
        kind: 'location',
        title: 'Acme Shop',
        subtitle: '100 Main Street, Seattle, WA 98101',
        badges: ['Inactive'],
        phone: '(555) 111-2222',
        addressLine1: '100 Main Street',
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
        customerId: 'customer-1',
        customerName: 'Acme Heating',
        isActive: false,
        score: 75
      }
    ]);
  });

  it('passes digit-only phone prefixes into CRM search', async () => {
    const databaseService = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }))
    };
    const repository = new ReferenceDataRepository(databaseService as never);

    await repository.searchCrm('(555) 111', 10);

    expect(databaseService.query.mock.calls[0]?.[1]).toEqual(['(555) 111', '(555) 111', '555111', 10]);
  });

  it('escapes SQL wildcard characters in CRM search prefixes', async () => {
    const databaseService = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }))
    };
    const repository = new ReferenceDataRepository(databaseService as never);

    await repository.searchCrm('Acme_%', 10);

    expect(databaseService.query.mock.calls[0]?.[1]).toEqual(['acme_%', 'acme\\_\\%', '', 10]);
  });

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
