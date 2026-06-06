import { BadRequestException } from '@nestjs/common';
import {
  toResolveRegisterCostRequest,
  type ResolveRegisterCostRequestBodyDto
} from './job-costing.dto';

function body(
  overrides: Partial<ResolveRegisterCostRequestBodyDto>
): ResolveRegisterCostRequestBodyDto {
  return { mode: 'zeroCost', ...overrides } as ResolveRegisterCostRequestBodyDto;
}

describe('toResolveRegisterCostRequest', () => {
  it('narrows tracked inventory and requires item + location', () => {
    expect(
      toResolveRegisterCostRequest(
        body({ mode: 'trackedInventory', itemId: 'i-1', locationId: 'l-1' })
      )
    ).toEqual({ mode: 'trackedInventory', itemId: 'i-1', locationId: 'l-1' });

    expect(() =>
      toResolveRegisterCostRequest(body({ mode: 'trackedInventory', itemId: 'i-1' }))
    ).toThrow(BadRequestException);
  });

  it('narrows non-stock material and requires an amount', () => {
    expect(toResolveRegisterCostRequest(body({ mode: 'nonStockMaterial', amount: 18.5 }))).toEqual({
      mode: 'nonStockMaterial',
      amount: 18.5
    });
    expect(() => toResolveRegisterCostRequest(body({ mode: 'nonStockMaterial' }))).toThrow(
      BadRequestException
    );
  });

  it('narrows labor and requires hours + rate', () => {
    expect(
      toResolveRegisterCostRequest(body({ mode: 'laborActual', hours: 2, ratePerHour: 80 }))
    ).toEqual({ mode: 'laborActual', hours: 2, ratePerHour: 80 });
    expect(() => toResolveRegisterCostRequest(body({ mode: 'laborActual', hours: 2 }))).toThrow(
      BadRequestException
    );
  });

  it('narrows zero-cost with no extra fields', () => {
    expect(toResolveRegisterCostRequest(body({ mode: 'zeroCost' }))).toEqual({ mode: 'zeroCost' });
  });
});
