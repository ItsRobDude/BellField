import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EstimatesService } from './estimates.service';
import type { EstimateRecord } from './estimates.types';

function createService() {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: [
        'estimates:view',
        'estimates:create',
        'estimates:edit',
        'estimates:approve'
      ],
      sessionSurface: 'office-web'
    })
  };
  const jobsDataService = {
    getJobById: jest.fn().mockResolvedValue({ id: 'job-1', status: 'new' })
  };
  const estimatesRepository = {
    listEstimatesForJob: jest.fn().mockResolvedValue([]),
    getEstimateById: jest.fn(),
    catalogItemExists: jest.fn().mockResolvedValue(true),
    createEstimate: jest.fn(),
    replaceEstimate: jest.fn(),
    approveEstimate: jest.fn(),
    declineEstimate: jest.fn()
  };
  const invoicesRepository = {
    countActiveLines: jest.fn().mockResolvedValue(0),
    convertEstimateIntoDraft: jest.fn().mockResolvedValue({ invoiceId: 'invoice-main-job-1' }),
    getMainInvoiceForJob: jest.fn().mockResolvedValue({ id: 'invoice-main-job-1' })
  };

  return {
    service: new EstimatesService(
      identityAccessService as never,
      jobsDataService as never,
      estimatesRepository as never,
      invoicesRepository as never
    ),
    identityAccessService,
    jobsDataService,
    estimatesRepository,
    invoicesRepository
  };
}

function pendingEstimate(overrides: Partial<EstimateRecord> = {}): EstimateRecord {
  return {
    id: 'estimate-1',
    jobId: 'job-1',
    status: 'pending',
    title: 'AC replacement',
    taxRateBasisPoints: 0,
    lineItems: [
      {
        id: 'line-1',
        estimateId: 'estimate-1',
        position: 0,
        kind: 'equipment',
        description: 'Condenser',
        quantity: 1,
        unitPrice: 100,
        unitCost: 60,
        taxable: true,
        lineSubtotal: 100,
        lineCost: 60,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z'
      }
    ],
    totals: {
      subtotal: 100,
      discount: 0,
      taxableBase: 100,
      tax: 0,
      total: 100,
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

describe('EstimatesService', () => {
  it('prices a created estimate through the shared engine and persists the snapshot', async () => {
    const { service, estimatesRepository } = createService();
    estimatesRepository.createEstimate.mockImplementation(async () => pendingEstimate());

    await service.createEstimate('token', 'job-1', {
      title: 'AC replacement',
      taxRateBasisPoints: 1000,
      lineItems: [
        {
          kind: 'equipment',
          description: 'Condenser',
          quantity: 1,
          unitPrice: 100,
          unitCost: 60,
          taxable: true
        }
      ]
    });

    expect(estimatesRepository.createEstimate).toHaveBeenCalledTimes(1);
    const [, writeInput] = estimatesRepository.createEstimate.mock.calls[0];
    // 10% tax on the taxable $100 line.
    expect(writeInput.totals.subtotal).toBe(100);
    expect(writeInput.totals.tax).toBe(10);
    expect(writeInput.totals.total).toBe(110);
    expect(writeInput.totals.profit).toBe(40);
    expect(writeInput.totals.marginBasisPoints).toBe(4000);
    expect(writeInput.lineTotals[0]).toEqual({ lineSubtotal: 100, lineCost: 60 });
  });

  it('rejects an estimate with no line items', async () => {
    const { service } = createService();
    await expect(
      service.createEstimate('token', 'job-1', { title: 'Empty', lineItems: [] })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('surfaces an engine RangeError as a 400 rather than a 500', async () => {
    const { service } = createService();
    await expect(
      service.createEstimate('token', 'job-1', {
        title: 'Bad price',
        lineItems: [{ kind: 'part', description: 'X', quantity: 1, unitPrice: -5, taxable: true }]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown discount kind instead of treating it as fixed', async () => {
    const { service, estimatesRepository } = createService();
    await expect(
      service.createEstimate('token', 'job-1', {
        title: 'Bogus discount',
        // The DTO only checks that discount is an object, so this malformed
        // payload reaches the service; it must be rejected, not coerced.
        discount: { kind: 'bogus', amount: 50 } as never,
        lineItems: [{ kind: 'part', description: 'X', quantity: 1, unitPrice: 100, taxable: true }]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(estimatesRepository.createEstimate).not.toHaveBeenCalled();
  });

  it('rejects a percent discount with a non-numeric basisPoints', async () => {
    const { service } = createService();
    await expect(
      service.createEstimate('token', 'job-1', {
        title: 'Bad percent',
        discount: { kind: 'percent', basisPoints: 'lots' } as never,
        lineItems: [{ kind: 'part', description: 'X', quantity: 1, unitPrice: 100, taxable: true }]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a well-formed fixed discount and forwards it to the repository', async () => {
    const { service, estimatesRepository } = createService();
    estimatesRepository.createEstimate.mockImplementation(async () => pendingEstimate());

    await service.createEstimate('token', 'job-1', {
      title: 'Fixed discount',
      discount: { kind: 'fixed', amount: 25 },
      lineItems: [{ kind: 'part', description: 'X', quantity: 1, unitPrice: 100, taxable: true }]
    });

    const [, writeInput] = estimatesRepository.createEstimate.mock.calls[0];
    expect(writeInput.discount).toEqual({ kind: 'fixed', amount: 25 });
  });

  it('preserves catalog provenance on estimate lines', async () => {
    const { service, estimatesRepository } = createService();
    estimatesRepository.createEstimate.mockImplementation(async () =>
      pendingEstimate({
        lineItems: [
          {
            ...pendingEstimate().lineItems[0],
            catalogItemId: 'catalog-1',
            catalogSnapshot: {
              catalogItemId: 'catalog-1',
              name: 'Compressor',
              kind: 'part',
              taxable: true,
              priceMode: 'standard'
            }
          }
        ]
      })
    );

    await service.createEstimate('token', 'job-1', {
      title: 'Catalog quote',
      lineItems: [
        {
          kind: 'part',
          description: 'Compressor',
          quantity: 1,
          unitPrice: 500,
          taxable: true,
          catalogItemId: 'catalog-1',
          catalogSnapshot: {
            catalogItemId: 'catalog-1',
            name: 'Compressor',
            kind: 'part',
            taxable: true,
            priceMode: 'standard'
          }
        }
      ]
    });

    const [, writeInput] = estimatesRepository.createEstimate.mock.calls[0];
    expect(estimatesRepository.catalogItemExists).toHaveBeenCalledWith('catalog-1');
    expect(writeInput.lineItems[0].catalogItemId).toBe('catalog-1');
    expect(writeInput.lineItems[0].catalogSnapshot?.name).toBe('Compressor');
  });

  it('rejects a catalog line whose referenced item is missing', async () => {
    const { service, estimatesRepository } = createService();
    estimatesRepository.catalogItemExists.mockResolvedValue(false);

    await expect(
      service.createEstimate('token', 'job-1', {
        title: 'Missing Catalog item',
        lineItems: [
          {
            kind: 'part',
            description: 'Compressor',
            quantity: 1,
            unitPrice: 500,
            taxable: true,
            catalogItemId: 'missing-catalog-item'
          }
        ]
      })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(estimatesRepository.createEstimate).not.toHaveBeenCalled();
  });

  it('rejects a malformed catalog snapshot', async () => {
    const { service, estimatesRepository } = createService();

    await expect(
      service.createEstimate('token', 'job-1', {
        title: 'Bad Catalog snapshot',
        lineItems: [
          {
            kind: 'part',
            description: 'Compressor',
            quantity: 1,
            unitPrice: 500,
            taxable: true,
            catalogItemId: 'catalog-1',
            catalogSnapshot: {
              catalogItemId: 'catalog-1',
              name: '',
              kind: 'part',
              taxable: true,
              priceMode: 'standard'
            }
          }
        ]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(estimatesRepository.createEstimate).not.toHaveBeenCalled();
  });

  it('rejects a catalog snapshot whose id disagrees with the line reference', async () => {
    const { service, estimatesRepository } = createService();

    await expect(
      service.createEstimate('token', 'job-1', {
        title: 'Mismatched Catalog snapshot',
        lineItems: [
          {
            kind: 'part',
            description: 'Compressor',
            quantity: 1,
            unitPrice: 500,
            taxable: true,
            catalogItemId: 'catalog-1',
            catalogSnapshot: {
              catalogItemId: 'catalog-2',
              name: 'Compressor',
              kind: 'part',
              taxable: true,
              priceMode: 'standard'
            }
          }
        ]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(estimatesRepository.createEstimate).not.toHaveBeenCalled();
  });

  it('rejects a discount that mixes percent and fixed fields', async () => {
    const { service } = createService();
    await expect(
      service.createEstimate('token', 'job-1', {
        title: 'Conflicting discount',
        discount: { kind: 'percent', basisPoints: 1000, amount: -50 } as never,
        lineItems: [{ kind: 'part', description: 'X', quantity: 1, unitPrice: 100, taxable: true }]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('restricts every estimate operation to office-web sessions', async () => {
    const { service, estimatesRepository, identityAccessService } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(pendingEstimate());
    estimatesRepository.createEstimate.mockResolvedValue(pendingEstimate());
    estimatesRepository.replaceEstimate.mockResolvedValue(pendingEstimate());
    estimatesRepository.approveEstimate.mockResolvedValue(pendingEstimate({ status: 'approved' }));
    estimatesRepository.declineEstimate.mockResolvedValue(pendingEstimate({ status: 'declined' }));

    await service.listEstimatesForJob('token', 'job-1');
    await service.getEstimate('token', 'estimate-1');
    await service.createEstimate('token', 'job-1', {
      title: 'Q',
      lineItems: [{ kind: 'part', description: 'X', quantity: 1, unitPrice: 10, taxable: true }]
    });
    await service.updateEstimate('token', 'estimate-1', { title: 'Q2' });
    await service.approveEstimate('token', 'estimate-1');
    await service.declineEstimate('token', 'estimate-1', {});

    // Every authorization call must constrain the session to office-web. The field
    // app has no estimate builder yet and these endpoints do no assignment scoping.
    for (const call of identityAccessService.getAuthorizedEmployee.mock.calls) {
      expect(call[2]).toEqual(['office-web']);
    }
  });

  it('exports an optioned printable estimate document gated on estimates:view', async () => {
    const { service, identityAccessService, estimatesRepository } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(
      pendingEstimate({
        title: 'Replacement options',
        selectedOptionId: 'better',
        optionGroups: [
          {
            id: 'standard-options',
            title: 'Options',
            position: 0,
            options: [
              {
                id: 'good',
                label: 'Good',
                position: 0,
                totals: {
                  subtotal: 100,
                  discount: 0,
                  taxableBase: 100,
                  tax: 0,
                  total: 100,
                  totalCost: 60,
                  profit: 40,
                  marginBasisPoints: 4000,
                  costComplete: true
                }
              },
              {
                id: 'better',
                label: 'Better',
                position: 1,
                totals: {
                  subtotal: 150,
                  discount: 0,
                  taxableBase: 150,
                  tax: 0,
                  total: 150,
                  totalCost: 75,
                  profit: 75,
                  marginBasisPoints: 5000,
                  costComplete: true
                }
              }
            ]
          }
        ],
        lineItems: [
          pendingEstimate().lineItems[0],
          {
            id: 'line-2',
            estimateId: 'estimate-1',
            position: 1,
            kind: 'equipment',
            description: 'Better condenser',
            quantity: 1,
            unitPrice: 50,
            unitCost: 15,
            taxable: true,
            optionGroupId: 'standard-options',
            optionId: 'better',
            lineSubtotal: 50,
            lineCost: 15,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z'
          }
        ]
      })
    );

    const document = await service.exportEstimateDocument('token', 'estimate-1');

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'estimates:view',
      ['office-web']
    );
    expect(document.filename).toContain('estimate-Replacement-options');
    expect(document.html).toContain('Better - Selected');
    expect(document.html).toContain('Better condenser');
    expect(document.html).toContain('Option total');
    expect(document.html).toContain('$150.00');
    expect(document.html).not.toContain('Profit');
  });

  it('refuses to edit an approved estimate (strict lifecycle)', async () => {
    const { service, estimatesRepository } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(pendingEstimate({ status: 'approved' }));

    await expect(
      service.updateEstimate('token', 'estimate-1', { title: 'Changed' })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(estimatesRepository.replaceEstimate).not.toHaveBeenCalled();
  });

  it('approves only a pending estimate and never mutates the job', async () => {
    const { service, estimatesRepository, jobsDataService } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(pendingEstimate());
    estimatesRepository.approveEstimate.mockResolvedValue(pendingEstimate({ status: 'approved' }));

    const result = await service.approveEstimate('token', 'estimate-1');

    expect(result.estimate.status).toBe('approved');
    expect(estimatesRepository.approveEstimate).toHaveBeenCalledWith(
      'estimate-1',
      expect.any(Object),
      {}
    );
    // Invariant: approval has no downstream side-effects on the job.
    expect(jobsDataService.getJobById).not.toHaveBeenCalled();
  });

  it('prices option paths as base lines plus each option', async () => {
    const { service, estimatesRepository } = createService();
    estimatesRepository.createEstimate.mockImplementation(async () => pendingEstimate());

    await service.createEstimate('token', 'job-1', {
      title: 'Repair options',
      taxRateBasisPoints: 0,
      optionGroups: [
        {
          id: 'standard-options',
          title: 'Options',
          position: 0,
          options: [
            { id: 'good', label: 'Good', position: 0 },
            { id: 'better', label: 'Better', position: 1 }
          ]
        }
      ],
      lineItems: [
        {
          kind: 'serviceItem',
          description: 'Diagnostic',
          quantity: 1,
          unitPrice: 100,
          taxable: false
        },
        {
          kind: 'part',
          description: 'Basic repair',
          quantity: 1,
          unitPrice: 200,
          taxable: false,
          optionGroupId: 'standard-options',
          optionId: 'good'
        },
        {
          kind: 'part',
          description: 'Better repair',
          quantity: 1,
          unitPrice: 400,
          taxable: false,
          optionGroupId: 'standard-options',
          optionId: 'better'
        }
      ]
    });

    const [, writeInput] = estimatesRepository.createEstimate.mock.calls[0];
    expect(writeInput.optionGroups[0].options[0].totals.total).toBe(300);
    expect(writeInput.optionGroups[0].options[1].totals.total).toBe(500);
    expect(writeInput.totals.total).toBe(300);
  });

  it('requires one selected option before approving an optioned estimate', async () => {
    const { service, estimatesRepository } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(
      pendingEstimate({
        optionGroups: [
          {
            id: 'standard-options',
            title: 'Options',
            position: 0,
            options: [
              { id: 'good', label: 'Good', position: 0, totals: pendingEstimate().totals },
              { id: 'better', label: 'Better', position: 1, totals: pendingEstimate().totals }
            ]
          }
        ]
      })
    );

    await expect(service.approveEstimate('token', 'estimate-1', {})).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(estimatesRepository.approveEstimate).not.toHaveBeenCalled();
  });

  it('approves one selected option path and forwards that option total', async () => {
    const { service, estimatesRepository } = createService();
    const betterTotals = { ...pendingEstimate().totals, total: 500, subtotal: 500 };
    estimatesRepository.getEstimateById.mockResolvedValue(
      pendingEstimate({
        optionGroups: [
          {
            id: 'standard-options',
            title: 'Options',
            position: 0,
            options: [
              { id: 'good', label: 'Good', position: 0, totals: pendingEstimate().totals },
              { id: 'better', label: 'Better', position: 1, totals: betterTotals }
            ]
          }
        ]
      })
    );
    estimatesRepository.approveEstimate.mockResolvedValue(
      pendingEstimate({ status: 'approved', selectedOptionId: 'better', totals: betterTotals })
    );

    await service.approveEstimate('token', 'estimate-1', { selectedOptionId: 'better' });

    expect(estimatesRepository.approveEstimate).toHaveBeenCalledWith(
      'estimate-1',
      expect.any(Object),
      { selectedOptionId: 'better', totals: betterTotals }
    );
  });

  it('refuses to approve an already-declined estimate', async () => {
    const { service, estimatesRepository } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(pendingEstimate({ status: 'declined' }));

    await expect(service.approveEstimate('token', 'estimate-1')).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('throws NotFound for a missing estimate', async () => {
    const { service, estimatesRepository } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(null);

    await expect(service.getEstimate('token', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('EstimatesService convertToInvoice', () => {
  it('converts an approved estimate by copying its snapshot atomically', async () => {
    const { service, estimatesRepository, invoicesRepository } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(pendingEstimate({ status: 'approved' }));

    const result = await service.convertToInvoice('token', 'estimate-1', {});

    // The atomic conversion (claim + lines + audit + recompute) is delegated to
    // the invoices repository as one transaction; it also carries the actor and
    // estimate title for the in-transaction timeline + audit stamp. The mode is
    // passed through unchanged (undefined here) — the repository enforces the
    // block-with-choice gate in-transaction rather than the service defaulting it.
    expect(invoicesRepository.convertEstimateIntoDraft).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        estimateId: 'estimate-1',
        estimateTitle: expect.any(String),
        actor: expect.objectContaining({ id: expect.any(String) }),
        lines: expect.any(Array)
      }),
      undefined
    );
    expect(result.invoice.id).toBe('invoice-main-job-1');
  });

  it('refuses to convert a non-approved estimate', async () => {
    const { service, estimatesRepository, invoicesRepository } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(pendingEstimate({ status: 'pending' }));

    await expect(service.convertToInvoice('token', 'estimate-1', {})).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(invoicesRepository.convertEstimateIntoDraft).not.toHaveBeenCalled();
  });

  it('blocks conversion when the draft has lines and no mode is given', async () => {
    const { service, estimatesRepository, invoicesRepository } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(pendingEstimate({ status: 'approved' }));
    invoicesRepository.countActiveLines.mockResolvedValue(2);

    await expect(service.convertToInvoice('token', 'estimate-1', {})).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(invoicesRepository.convertEstimateIntoDraft).not.toHaveBeenCalled();
  });

  it('allows replace mode when the draft has lines', async () => {
    const { service, estimatesRepository, invoicesRepository } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(pendingEstimate({ status: 'approved' }));
    invoicesRepository.countActiveLines.mockResolvedValue(2);

    await service.convertToInvoice('token', 'estimate-1', { mode: 'replace' });

    expect(invoicesRepository.convertEstimateIntoDraft).toHaveBeenCalledWith(
      'job-1',
      expect.any(Object),
      'replace'
    );
  });

  it('converts only base lines plus the approved option lines', async () => {
    const { service, estimatesRepository, invoicesRepository } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(
      pendingEstimate({
        status: 'approved',
        selectedOptionId: 'better',
        optionGroups: [
          {
            id: 'standard-options',
            title: 'Options',
            position: 0,
            options: [
              { id: 'good', label: 'Good', position: 0, totals: pendingEstimate().totals },
              { id: 'better', label: 'Better', position: 1, totals: pendingEstimate().totals }
            ]
          }
        ],
        lineItems: [
          {
            ...pendingEstimate().lineItems[0],
            id: 'base-line',
            description: 'Diagnostic',
            optionGroupId: undefined,
            optionId: undefined
          },
          {
            ...pendingEstimate().lineItems[0],
            id: 'good-line',
            description: 'Good repair',
            optionGroupId: 'standard-options',
            optionId: 'good'
          },
          {
            ...pendingEstimate().lineItems[0],
            id: 'better-line',
            description: 'Better repair',
            optionGroupId: 'standard-options',
            optionId: 'better'
          }
        ]
      })
    );

    await service.convertToInvoice('token', 'estimate-1', {});

    const conversionInput = invoicesRepository.convertEstimateIntoDraft.mock.calls[0][1];
    expect(
      conversionInput.lines.map((line: { estimateLineItemId: string }) => line.estimateLineItemId)
    ).toEqual(['base-line', 'better-line']);
  });

  it('refuses to convert an estimate that was already converted', async () => {
    const { service, estimatesRepository, invoicesRepository } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(
      pendingEstimate({ status: 'approved', convertedToInvoiceId: 'invoice-main-job-1' })
    );

    await expect(service.convertToInvoice('token', 'estimate-1', {})).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(invoicesRepository.convertEstimateIntoDraft).not.toHaveBeenCalled();
  });

  it('refuses to convert a superseded estimate', async () => {
    const { service, estimatesRepository, invoicesRepository } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(
      pendingEstimate({ status: 'approved', supersededByEstimateId: 'estimate-2' })
    );

    await expect(service.convertToInvoice('token', 'estimate-1', {})).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(invoicesRepository.convertEstimateIntoDraft).not.toHaveBeenCalled();
  });
});
