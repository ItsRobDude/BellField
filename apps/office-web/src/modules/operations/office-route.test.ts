import { describe, expect, it } from 'vitest';
import { formatOfficeRoute, parseOfficeRoute, type OfficeRoute } from './office-route';

describe('parseOfficeRoute', () => {
  it.each<[string, OfficeRoute | null]>([
    ['/', { view: 'dispatch', date: null }],
    ['/dispatch', { view: 'dispatch', date: null }],
    ['/dispatch/', { view: 'dispatch', date: null }],
    ['/dispatch/2026-09-06', { view: 'dispatch', date: '2026-09-06' }],
    ['/dispatch/2026-13-45', null],
    ['/dispatch/tomorrow', null],
    ['/customers', { view: 'customers', target: null }],
    [
      '/customers/cust-1',
      { view: 'customers', target: { kind: 'customer', customerId: 'cust-1' } }
    ],
    ['/locations/loc-1', { view: 'customers', target: { kind: 'location', locationId: 'loc-1' } }],
    ['/locations', null],
    ['/jobs', { view: 'jobs' }],
    ['/jobs/new', { view: 'jobIntake' }],
    ['/jobs/new/extra', null],
    ['/jobs/job-1', { view: 'jobDetail', jobId: 'job-1', tab: 'overview', appointmentId: null }],
    [
      '/jobs/job-1/invoice',
      { view: 'jobDetail', jobId: 'job-1', tab: 'invoice', appointmentId: null }
    ],
    [
      '/jobs/job-1?appointment=appt-2',
      { view: 'jobDetail', jobId: 'job-1', tab: 'overview', appointmentId: 'appt-2' }
    ],
    [
      '/jobs/job-1/appointments?appointment=appt-2',
      { view: 'jobDetail', jobId: 'job-1', tab: 'appointments', appointmentId: 'appt-2' }
    ],
    ['/jobs/job-1/not-a-tab', null],
    ['/jobs/job-1/invoice/extra', null],
    ['/bookkeeping', { view: 'bookkeeping' }],
    ['/inventory', { view: 'inventory' }],
    ['/settings', { view: 'settings' }],
    ['/nope', null],
    ['/settings/extra', null],
    ['/%E0%A4%A', null]
  ])('parses %s', (location, expected) => {
    expect(parseOfficeRoute(location)).toEqual(expected);
  });

  it('decodes encoded ids', () => {
    expect(parseOfficeRoute('/customers/cust%201')).toEqual({
      view: 'customers',
      target: { kind: 'customer', customerId: 'cust 1' }
    });
  });
});

describe('formatOfficeRoute', () => {
  it.each<[OfficeRoute, string]>([
    [{ view: 'dispatch', date: null }, '/dispatch'],
    [{ view: 'dispatch', date: '2026-09-06' }, '/dispatch/2026-09-06'],
    [{ view: 'customers', target: null }, '/customers'],
    [
      { view: 'customers', target: { kind: 'customer', customerId: 'cust 1' } },
      '/customers/cust%201'
    ],
    [{ view: 'customers', target: { kind: 'location', locationId: 'loc-1' } }, '/locations/loc-1'],
    [{ view: 'jobs' }, '/jobs'],
    [{ view: 'jobIntake' }, '/jobs/new'],
    [{ view: 'jobDetail', jobId: 'job-1', tab: 'overview', appointmentId: null }, '/jobs/job-1'],
    [
      { view: 'jobDetail', jobId: 'job-1', tab: 'jobCost', appointmentId: null },
      '/jobs/job-1/jobCost'
    ],
    [
      { view: 'jobDetail', jobId: 'job-1', tab: 'overview', appointmentId: 'appt 2' },
      '/jobs/job-1?appointment=appt+2'
    ],
    [{ view: 'history' }, '/history']
  ])('formats %j', (route, expected) => {
    expect(formatOfficeRoute(route)).toBe(expected);
  });

  it('round-trips every formatted route back through the parser', () => {
    const routes: OfficeRoute[] = [
      { view: 'dispatch', date: '2026-01-31' },
      { view: 'customers', target: { kind: 'location', locationId: 'loc/1' } },
      { view: 'jobDetail', jobId: 'job-1', tab: 'appointments', appointmentId: 'appt-2' },
      { view: 'jobDetail', jobId: 'job 1', tab: 'timeline', appointmentId: null },
      { view: 'purchasing' }
    ];

    for (const route of routes) {
      expect(parseOfficeRoute(formatOfficeRoute(route))).toEqual(route);
    }
  });
});
