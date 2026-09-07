import { jobDetailTabs } from './job-detail-tabs';
import type { JobDetailTab } from './job-work-types';
import type { OfficeView } from './office-workspace-frame';

// Every office screen has a URL so refresh, bookmarks, shared links, and browser Back/Forward
// all work. The office app is still one client shell; these routes are its addresses.
//
//   /                                  Dispatch, today
//   /dispatch                          Dispatch, today
//   /dispatch/2026-09-06               Dispatch for one day
//   /customers                         Customer search
//   /customers/:customerId             Customer detail
//   /locations/:locationId             Location detail
//   /jobs                              Jobs queue
//   /jobs/new                          New job intake
//   /jobs/:jobId                       Job detail, Overview tab
//   /jobs/:jobId/:tab                  Job detail on a tab
//   /jobs/:jobId?appointment=:id       Job detail focused on one appointment
//   /catalog, /inventory, ...          The remaining rail surfaces

export type OfficeCrmRouteTarget =
  | { kind: 'customer'; customerId: string }
  | { kind: 'location'; locationId: string };

type SimpleOfficeView = Exclude<OfficeView, 'dispatch' | 'customers' | 'jobDetail'>;

export type OfficeRoute =
  | { view: 'dispatch'; date: string | null }
  | { view: 'customers'; target: OfficeCrmRouteTarget | null }
  | { view: 'jobDetail'; jobId: string; tab: JobDetailTab; appointmentId: string | null }
  | { view: SimpleOfficeView };

export const defaultOfficeRoute: OfficeRoute = { view: 'dispatch', date: null };

const simpleViewPaths: Record<SimpleOfficeView, string> = {
  jobs: '/jobs',
  jobIntake: '/jobs/new',
  catalog: '/catalog',
  agreements: '/agreements',
  inventory: '/inventory',
  purchasing: '/purchasing',
  bookkeeping: '/bookkeeping',
  reports: '/reports',
  employees: '/employees',
  settings: '/settings',
  system: '/system',
  history: '/history'
};

const railViewsBySegment: Record<string, SimpleOfficeView | undefined> = {
  catalog: 'catalog',
  agreements: 'agreements',
  inventory: 'inventory',
  purchasing: 'purchasing',
  bookkeeping: 'bookkeeping',
  reports: 'reports',
  employees: 'employees',
  settings: 'settings',
  system: 'system',
  history: 'history'
};

const focusedAppointmentSearchParam = 'appointment';
const jobDetailTabIds = new Set<string>(jobDetailTabs.map((tab) => tab.id));
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!isoDatePattern.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function splitPathSegments(pathname: string): string[] | null {
  const segments: string[] = [];

  for (const rawSegment of pathname.split('/')) {
    if (!rawSegment) {
      continue;
    }

    try {
      segments.push(decodeURIComponent(rawSegment));
    } catch {
      return null;
    }
  }

  return segments;
}

/**
 * Parses a location (`pathname` plus optional `?search`) into an office route.
 * Returns `null` for anything the office app does not know, so the caller can fall back to
 * the default screen and repair the address bar.
 */
export function parseOfficeRoute(location: string): OfficeRoute | null {
  const searchStart = location.indexOf('?');
  const pathname = searchStart === -1 ? location : location.slice(0, searchStart);
  const search = searchStart === -1 ? '' : location.slice(searchStart);
  const segments = splitPathSegments(pathname);

  if (!segments) {
    return null;
  }

  const [first, second, third] = segments;

  if (segments.length === 0) {
    return { view: 'dispatch', date: null };
  }

  if (first === 'dispatch') {
    if (segments.length === 1) {
      return { view: 'dispatch', date: null };
    }

    if (segments.length === 2 && second && isValidIsoDate(second)) {
      return { view: 'dispatch', date: second };
    }

    return null;
  }

  if (first === 'customers') {
    if (segments.length === 1) {
      return { view: 'customers', target: null };
    }

    if (segments.length === 2 && second) {
      return { view: 'customers', target: { kind: 'customer', customerId: second } };
    }

    return null;
  }

  if (first === 'locations') {
    if (segments.length === 2 && second) {
      return { view: 'customers', target: { kind: 'location', locationId: second } };
    }

    return null;
  }

  if (first === 'jobs') {
    if (segments.length === 1) {
      return { view: 'jobs' };
    }

    if (second === 'new') {
      return segments.length === 2 ? { view: 'jobIntake' } : null;
    }

    if (!second || segments.length > 3) {
      return null;
    }

    const appointmentId = new URLSearchParams(search).get(focusedAppointmentSearchParam);

    if (segments.length === 2) {
      return { view: 'jobDetail', jobId: second, tab: 'overview', appointmentId };
    }

    if (third && jobDetailTabIds.has(third)) {
      return { view: 'jobDetail', jobId: second, tab: third as JobDetailTab, appointmentId };
    }

    return null;
  }

  if (segments.length === 1) {
    const railView = railViewsBySegment[first];

    if (railView) {
      return { view: railView };
    }
  }

  return null;
}

export function formatOfficeRoute(route: OfficeRoute): string {
  switch (route.view) {
    case 'dispatch':
      return route.date ? `/dispatch/${route.date}` : '/dispatch';
    case 'customers':
      if (!route.target) {
        return '/customers';
      }

      return route.target.kind === 'customer'
        ? `/customers/${encodeURIComponent(route.target.customerId)}`
        : `/locations/${encodeURIComponent(route.target.locationId)}`;
    case 'jobDetail': {
      const jobPath = `/jobs/${encodeURIComponent(route.jobId)}`;
      const tabPath = route.tab === 'overview' ? jobPath : `${jobPath}/${route.tab}`;

      if (!route.appointmentId) {
        return tabPath;
      }

      const search = new URLSearchParams({
        [focusedAppointmentSearchParam]: route.appointmentId
      });
      return `${tabPath}?${search.toString()}`;
    }
    default:
      return simpleViewPaths[route.view];
  }
}
