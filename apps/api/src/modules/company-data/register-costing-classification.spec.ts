import { classifyRegisterCosting } from './register-costing-classification';

describe('classifyRegisterCosting', () => {
  it('treats part and labor as cost-expected (needsResolution, policy decided at resolution)', () => {
    for (const kind of ['part', 'labor'] as const) {
      expect(classifyRegisterCosting(kind)).toEqual({
        costingStatus: 'needsResolution',
        costingPolicy: null
      });
    }
  });

  it('treats serviceItem, membership, and other as billing-only (notCosted / none)', () => {
    for (const kind of ['serviceItem', 'membership', 'other'] as const) {
      expect(classifyRegisterCosting(kind)).toEqual({
        costingStatus: 'notCosted',
        costingPolicy: 'none'
      });
    }
  });
});
