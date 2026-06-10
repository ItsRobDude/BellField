import type { CompanySettings } from '@bellfield/contracts';
import type {
  CustomerAccountRecord,
  JobRecord,
  LocationRecord
} from '../company-data/company-data.types';
import type { EstimateRecord, EstimateLineItemRecord } from '../estimates/estimates.types';
import { EstimatePdfRendererService } from './estimate-pdf-renderer.service';

const settings = {
  companyName: 'BellField',
  replyToEmail: 'office@example.com'
} as CompanySettings;

const job = { id: 'job-1', jobNumber: '1001' } as JobRecord;

const location = {
  id: 'location-1',
  name: 'Main Shop',
  addressLine1: '123 Main St',
  city: 'Blaine',
  state: 'WA',
  postalCode: '98230'
} as LocationRecord;

const billToCustomer = {
  id: 'customer-1',
  name: 'Acme',
  billingAddressLine1: 'PO Box 1',
  billingCity: 'Blaine',
  billingState: 'WA',
  billingPostalCode: '98230'
} as CustomerAccountRecord;

function lineItem(overrides: Partial<EstimateLineItemRecord> = {}): EstimateLineItemRecord {
  return {
    id: `line-${Math.floor(Math.random() * 1_000_000)}`,
    estimateId: 'estimate-1',
    position: 0,
    kind: 'serviceItem',
    description: 'Diagnostic',
    quantity: 1,
    unitPrice: 100,
    taxable: true,
    lineSubtotal: 100,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides
  };
}

function estimateRecord(overrides: Partial<EstimateRecord> = {}): EstimateRecord {
  return {
    id: 'estimate-1',
    jobId: 'job-1',
    status: 'pending',
    title: 'AC replacement',
    taxRateBasisPoints: 825,
    lineItems: [lineItem()],
    totals: {
      subtotal: 100,
      discount: 0,
      taxableBase: 100,
      tax: 8.25,
      total: 108.25,
      totalCost: 60,
      profit: 40,
      marginBasisPoints: 4000,
      costComplete: true
    },
    createdByEmployeeId: 'office-1',
    createdByName: 'Dispatcher',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    version: 1,
    ...overrides
  };
}

function countPages(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type \/Page(?!s)/g) ?? []).length;
}

async function render(estimate: EstimateRecord): Promise<Buffer> {
  return new EstimatePdfRendererService().renderEstimatePdf({
    estimate,
    settings,
    job,
    location,
    billToCustomer,
    generatedAt: '2026-06-10T00:00:00.000Z'
  });
}

describe('EstimatePdfRendererService', () => {
  it('renders a simple estimate as a single-page PDF', async () => {
    const pdf = await render(estimateRecord());

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(countPages(pdf)).toBe(1);
  });

  it('flows long wrapped descriptions across page breaks instead of overlapping rows', async () => {
    const longDescription =
      'Remove and replace the existing condenser unit, recover refrigerant per EPA 608, ' +
      'install new pad and vibration isolators, braze line set connections, pull vacuum to ' +
      '500 microns, weigh in factory charge, and verify subcooling against nameplate. '.repeat(3);
    const lines = Array.from({ length: 25 }, (_, index) =>
      lineItem({ id: `line-${index}`, position: index, description: longDescription })
    );

    const pdf = await render(estimateRecord({ lineItems: lines }));

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(countPages(pdf)).toBeGreaterThan(1);
  });

  it('renders option groups with their own line tables without throwing', async () => {
    const estimate = estimateRecord({
      lineItems: [
        lineItem({ id: 'base-1', description: 'Base diagnostic work' }),
        lineItem({ id: 'good-1', description: 'Good option line', optionId: 'option-good' }),
        lineItem({ id: 'better-1', description: 'Better option line', optionId: 'option-better' })
      ],
      optionGroups: [
        {
          id: 'group-1',
          title: 'Choose a path',
          position: 0,
          options: [
            {
              id: 'option-good',
              label: 'Good',
              position: 0,
              totals: estimateRecord().totals
            },
            {
              id: 'option-better',
              label: 'Better',
              position: 1,
              totals: estimateRecord().totals
            }
          ]
        }
      ],
      selectedOptionId: 'option-good'
    });

    const pdf = await render(estimate);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(countPages(pdf)).toBeGreaterThanOrEqual(1);
  });
});
