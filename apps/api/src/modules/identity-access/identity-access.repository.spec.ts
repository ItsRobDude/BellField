import { IdentityAccessRepository } from './identity-access.repository';

function makeRepository() {
  const databaseService = {
    query: jest.fn()
  };
  return {
    databaseService,
    repository: new IdentityAccessRepository(databaseService as never)
  };
}

describe('IdentityAccessRepository identity attempts', () => {
  it('records a failed identity attempt with an atomic upsert counter', async () => {
    const { databaseService, repository } = makeRepository();
    databaseService.query.mockResolvedValueOnce({
      rows: [
        {
          failedCount: 5,
          windowStartedAt: new Date('2026-06-19T12:00:00.000Z'),
          lastFailedAt: new Date('2026-06-19T12:04:00.000Z'),
          blockedUntil: new Date('2026-06-19T12:09:00.000Z')
        }
      ]
    });

    const result = await repository.recordFailedIdentityAttempt({
      bucketKey: 'setup:first-owner',
      occurredAt: '2026-06-19T12:04:00.000Z',
      windowCutoff: '2026-06-19T11:49:00.000Z',
      failureThreshold: 5,
      blockedUntil: '2026-06-19T12:09:00.000Z'
    });

    const [sql, params] = databaseService.query.mock.calls[0];
    expect(sql).toMatch(/on conflict \(bucket_key\) do update/i);
    expect(sql).toMatch(/failed_count = case/i);
    expect(sql).toMatch(/identity_login_attempts\.failed_count \+ 1 >= \$4/i);
    expect(params).toEqual([
      'setup:first-owner',
      '2026-06-19T12:04:00.000Z',
      '2026-06-19T11:49:00.000Z',
      5,
      '2026-06-19T12:09:00.000Z'
    ]);
    expect(result).toEqual({
      failedCount: 5,
      windowStartedAt: '2026-06-19T12:00:00.000Z',
      lastFailedAt: '2026-06-19T12:04:00.000Z',
      blockedUntil: '2026-06-19T12:09:00.000Z'
    });
  });

  it('clears and prunes identity-attempt rows by bucket/timestamp only', async () => {
    const { databaseService, repository } = makeRepository();
    databaseService.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    databaseService.query.mockResolvedValueOnce({ rows: [], rowCount: 7 });

    await expect(repository.clearIdentityAttemptState('email:hash')).resolves.toBe(1);
    await repository.pruneStaleIdentityAttemptStates('2026-06-18T12:00:00.000Z');

    expect(databaseService.query.mock.calls[0]).toEqual([
      'delete from identity_login_attempts where bucket_key = $1',
      ['email:hash']
    ]);
    expect(databaseService.query.mock.calls[1][0]).toMatch(/delete from identity_login_attempts/i);
    expect(databaseService.query.mock.calls[1][0]).toMatch(/updated_at < \$1/i);
    expect(databaseService.query.mock.calls[1][1]).toEqual(['2026-06-18T12:00:00.000Z']);
  });
});
