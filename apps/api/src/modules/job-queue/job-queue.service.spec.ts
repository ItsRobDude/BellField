import { BadRequestException } from '@nestjs/common';
import { JobQueueService } from './job-queue.service';

const timestamp = '2026-05-23T10:00:00.000Z';

function buildQueueJob(id: string, updatedAt = timestamp) {
  return {
    id,
    jobNumber: id === 'job-1' ? '1001' : '1002',
    locationId: 'location-1',
    locationName: 'Main Shop',
    billToCustomerId: 'customer-1',
    billToCustomerName: 'Acme',
    jobType: 'Service',
    category: 'General',
    origin: 'Phone',
    summary: 'No cooling',
    status: 'scheduled',
    needsScheduling: false,
    needsOfficeReview: false,
    nextAppointment: {
      id: `appointment-${id}`,
      jobId: id,
      scheduledDate: '2026-05-23',
      scheduledStartTime: '08:00',
      scheduledEndTime: '10:00',
      technicianId: 'tech-1',
      technicianName: 'Taylor Tech',
      status: 'scheduled',
      needsOfficeReview: false
    },
    createdAt: timestamp,
    updatedAt
  };
}

function createService() {
  const jobsDataService = {
    listJobsQueuePage: jest.fn().mockResolvedValue({ jobs: [], totalCount: 0 })
  };
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'dispatcher-1',
      displayName: 'Dispatcher',
      sessionSurface: 'office-web',
      effectivePermissions: ['jobs:view']
    })
  };

  return {
    service: new JobQueueService(jobsDataService as never, identityAccessService as never),
    jobsDataService,
    identityAccessService
  };
}

describe('JobQueueService', () => {
  it('requires office job view permission and returns queues in office order', async () => {
    const { service, jobsDataService, identityAccessService } = createService();

    const response = await service.getJobsQueue('session-token', { limit: '10', cursors: {} });

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith('session-token', 'jobs:view', [
      'office-web'
    ]);
    expect(jobsDataService.listJobsQueuePage).toHaveBeenCalledTimes(4);
    expect(jobsDataService.listJobsQueuePage.mock.calls.map(([queueKey]) => queueKey)).toEqual([
      'review',
      'waitingOnParts',
      'unscheduled',
      'open'
    ]);
    expect(jobsDataService.listJobsQueuePage.mock.calls[0]?.[1]).toBe(11);
    expect(response).toEqual({
      limit: 10,
      queues: [
        { key: 'review', totalCount: 0, jobs: [], nextCursor: undefined },
        { key: 'waitingOnParts', totalCount: 0, jobs: [], nextCursor: undefined },
        { key: 'unscheduled', totalCount: 0, jobs: [], nextCursor: undefined },
        { key: 'open', totalCount: 0, jobs: [], nextCursor: undefined }
      ]
    });
  });

  it('returns a next cursor when the repository returns one extra row', async () => {
    const { service, jobsDataService } = createService();
    jobsDataService.listJobsQueuePage.mockImplementation(async (queueKey: string) => ({
      jobs:
        queueKey === 'open'
          ? [buildQueueJob('job-1', '2026-05-23T10:00:00.000Z'), buildQueueJob('job-2', '2026-05-22T10:00:00.000Z')]
          : [],
      totalCount: queueKey === 'open' ? 2 : 0
    }));

    const response = await service.getJobsQueue('session-token', { limit: '1', cursors: {} });
    const openQueue = response.queues.find((queue) => queue.key === 'open');
    const decodedCursor = JSON.parse(Buffer.from(openQueue?.nextCursor ?? '', 'base64url').toString('utf8'));

    expect(openQueue?.jobs).toHaveLength(1);
    expect(openQueue?.jobs[0]).toMatchObject({
      id: 'job-1',
      nextAppointment: {
        id: 'appointment-job-1',
        scheduledStartTime: '08:00',
        technicianName: 'Taylor Tech'
      }
    });
    expect(openQueue?.nextCursor).toBeTruthy();
    expect(decodedCursor).toEqual({
      queueKey: 'open',
      id: 'job-1',
      updatedAt: '2026-05-23T10:00:00.000Z'
    });
  });

  it('passes decoded cursors to the matching queue only', async () => {
    const { service, jobsDataService } = createService();
    const cursorPayload = { queueKey: 'unscheduled', id: 'job-10', updatedAt: '2026-05-22T09:00:00.000Z' };
    const cursor = Buffer.from(JSON.stringify(cursorPayload), 'utf8').toString('base64url');

    await service.getJobsQueue('session-token', { cursors: { unscheduled: cursor } });

    expect(jobsDataService.listJobsQueuePage.mock.calls[2]).toEqual(['unscheduled', 21, cursorPayload]);
    expect(jobsDataService.listJobsQueuePage.mock.calls[0]?.[2]).toBeUndefined();
  });

  it('rejects malformed limits and cursors', async () => {
    const { service } = createService();

    await expect(service.getJobsQueue('session-token', { limit: '0', cursors: {} })).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(service.getJobsQueue('session-token', { limit: '51', cursors: {} })).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(
      service.getJobsQueue('session-token', { cursors: { review: 'not-a-cursor' } })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getJobsQueue('session-token', {
        cursors: {
          review: Buffer.from(
            JSON.stringify({ queueKey: 'open', id: 'job-1', updatedAt: '2026-05-22T09:00:00.000Z' }),
            'utf8'
          ).toString('base64url')
        }
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
