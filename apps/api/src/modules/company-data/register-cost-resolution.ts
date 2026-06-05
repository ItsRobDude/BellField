import { BadRequestException } from '@nestjs/common';
import type { ResolveRegisterCostRequest } from '@bellfield/contracts';
import type { QueryExecutor } from '../../database/database.service';
import { applyIssueToJob } from '../inventory/inventory-ledger-utils';
import { insertJobCostEventWithin, roundMoney } from '../job-costing/job-cost-rollup-utils';
import type { CostingPolicy, RegisterEntryKind } from './company-data.types';

export type ResolvableRegisterEntry = {
  id: string;
  jobId: string;
  kind: RegisterEntryKind;
  quantity: number;
  description: string;
};

function requireKind(actual: RegisterEntryKind, expected: RegisterEntryKind, label: string): void {
  if (actual !== expected) {
    throw new BadRequestException(`A ${actual} line cannot be resolved as ${label}.`);
  }
}

/**
 * Create the cost artifact the office chose for a register line awaiting resolution (stock issue /
 * non-stock material / actual labor / no cost), linked back to the line via source_register_entry_id,
 * and return the resulting costing policy. Runs inside the resolver's transaction. The mode must
 * match the line's kind, and a zero/negative cost is rejected (a no-cost line uses `zeroCost`, not a
 * zero-rate labor/material event, which would violate the job_cost_events amount-sign check).
 */
export async function applyRegisterCostResolution(
  queryable: QueryExecutor,
  entry: ResolvableRegisterEntry,
  resolution: ResolveRegisterCostRequest,
  actor: { id: string; displayName: string },
  occurredAt: string
): Promise<CostingPolicy> {
  switch (resolution.mode) {
    case 'trackedInventory': {
      requireKind(entry.kind, 'part', 'tracked inventory');
      await applyIssueToJob(queryable, {
        itemId: resolution.itemId,
        locationId: resolution.locationId,
        jobId: entry.jobId,
        quantity: entry.quantity,
        actor,
        sourceRegisterEntryId: entry.id,
        occurredAt
      });
      return 'trackedInventory';
    }
    case 'nonStockMaterial': {
      requireKind(entry.kind, 'part', 'non-stock material');
      const amount = roundMoney(resolution.amount);
      if (!(amount > 0)) {
        throw new BadRequestException('Non-stock material cost must be greater than zero.');
      }
      await insertJobCostEventWithin(queryable, {
        jobId: entry.jobId,
        kind: 'material',
        description: entry.description,
        amount,
        hours: null,
        ratePerHour: null,
        sourceRegisterEntryId: entry.id,
        actor,
        occurredAt
      });
      return 'nonStockMaterial';
    }
    case 'laborActual': {
      requireKind(entry.kind, 'labor', 'labor');
      const amount = roundMoney(resolution.hours * resolution.ratePerHour);
      if (!(resolution.hours > 0) || resolution.ratePerHour < 0 || !(amount > 0)) {
        // A zero amount would violate the job_cost_events amount-sign check; a no-cost line
        // must be resolved as zeroCost, not labor at a 0 rate.
        throw new BadRequestException(
          'Labor cost must be greater than zero; use zero-cost for a no-charge line.'
        );
      }
      await insertJobCostEventWithin(queryable, {
        jobId: entry.jobId,
        kind: 'labor',
        description: entry.description,
        amount,
        hours: resolution.hours,
        ratePerHour: resolution.ratePerHour,
        sourceRegisterEntryId: entry.id,
        actor,
        occurredAt
      });
      return 'laborActual';
    }
    case 'zeroCost':
      return 'none';
  }
}
