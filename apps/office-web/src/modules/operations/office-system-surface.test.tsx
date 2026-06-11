import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as companySettingsApi from '@/lib/operations-company-settings-api';
import * as systemApi from '@/lib/system-diagnostics-api';
import { OfficeSystemSurface } from './office-system-surface';

vi.mock('@/lib/system-diagnostics-api', () => ({
  getSystemDiagnostics: vi.fn(),
  downloadSupportExport: vi.fn()
}));
vi.mock('@/lib/operations-company-settings-api', () => ({
  getOfficeEstimateEmailDeliveryStatus: vi.fn()
}));

const mockedApi = vi.mocked(systemApi);
const mockedCompanySettingsApi = vi.mocked(companySettingsApi);

const currentBackups = {
  enabled: true,
  backupRootPath: 'C:\\BellField\\data\\backups',
  retentionCount: 7,
  staleAfterHours: 36,
  latestRun: {
    status: 'succeeded' as const,
    startedAt: '2026-06-06T00:00:00.000Z',
    completedAt: '2026-06-06T00:02:00.000Z',
    backupSetPath: 'C:\\BellField\\data\\backups\\bellfield-backup-20260606-000000Z'
  },
  latestSuccessfulAt: '2026-06-06T00:02:00.000Z',
  latestSuccessfulBackupSetPath: 'C:\\BellField\\data\\backups\\bellfield-backup-20260606-000000Z',
  stale: false
};

function arrange() {
  mockedCompanySettingsApi.getOfficeEstimateEmailDeliveryStatus.mockResolvedValue({
    deliveryStatus: {
      configured: true,
      ready: true,
      status: 'ready',
      message: 'Estimate email is ready.'
    }
  });
  mockedApi.getSystemDiagnostics.mockResolvedValue({
    serverTime: '2026-06-06T00:00:00.000Z',
    app: { name: 'BellField API', version: '0.0.1', nodeEnv: 'development' },
    database: { reachable: true, latencyMs: 3 },
    migrations: {
      appliedCount: 41,
      latestFilename: '20260601_029_register_client_operation_id.up.sql',
      latestAppliedAt: '2026-06-05T00:00:00.000Z'
    },
    mediaRoot: { path: '/var/bellfield/media', exists: true, writable: true, readable: true },
    backups: currentBackups,
    checks: []
  });
}

function renderSurface(overrides: { canExportSupport?: boolean } = {}) {
  render(
    <OfficeSystemSurface
      apiBaseUrl="http://api.test"
      sessionToken="session-token"
      canExportSupport={overrides.canExportSupport ?? true}
    />
  );
}

beforeEach(() => {
  arrange();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('OfficeSystemSurface', () => {
  it('renders the readiness status from diagnostics', async () => {
    renderSurface();
    expect(await screen.findByText(/Reachable \(3 ms\)/)).toBeInTheDocument();
    expect(screen.getByText('41 applied')).toBeInTheDocument();
    expect(
      screen.getByText('20260601_029_register_client_operation_id.up.sql')
    ).toBeInTheDocument();
    expect(screen.getByText('Read/write OK')).toBeInTheDocument();
    expect(screen.getByText('Backups')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('C:\\BellField\\data\\backups')).toBeInTheDocument();
    expect(screen.getByText(/BellField API v0\.0\.1/)).toBeInTheDocument();
  });

  it('shows the support-bundle download for an actor with export permission', async () => {
    renderSurface({ canExportSupport: true });
    await screen.findByText(/Reachable/);
    expect(screen.getByRole('button', { name: 'Download support bundle' })).toBeInTheDocument();
  });

  it('hides the support-bundle download without export permission', async () => {
    renderSurface({ canExportSupport: false });
    await screen.findByText(/Reachable/);
    expect(screen.queryByRole('button', { name: 'Download support bundle' })).toBeNull();
  });

  it('surfaces a load error', async () => {
    mockedApi.getSystemDiagnostics.mockRejectedValue(new Error('Forbidden'));
    renderSurface();
    await waitFor(() => expect(screen.getByText('Forbidden')).toBeInTheDocument());
  });

  it('shows estimate email readiness when delivery is ready', async () => {
    renderSurface();
    expect(await screen.findByText('Estimate email')).toBeInTheDocument();
    expect(await screen.findByText('Ready')).toBeInTheDocument();
  });

  it('shows the safe not-configured message without provider details', async () => {
    mockedCompanySettingsApi.getOfficeEstimateEmailDeliveryStatus.mockResolvedValue({
      deliveryStatus: {
        configured: false,
        ready: false,
        status: 'needsSetup',
        message: 'Estimate email is not available on this server. Contact BellField support.'
      }
    });
    renderSurface();
    expect(await screen.findByText('Not configured')).toBeInTheDocument();
    expect(
      screen.getByText('Estimate email is not available on this server. Contact BellField support.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/resend/i)).toBeNull();
  });

  it('surfaces failing rollup checks that have no card of their own', async () => {
    mockedApi.getSystemDiagnostics.mockResolvedValue({
      serverTime: '2026-06-06T00:00:00.000Z',
      app: { name: 'BellField API', version: '0.0.1', nodeEnv: 'development' },
      database: { reachable: true, latencyMs: 3 },
      migrations: {
        appliedCount: 41,
        latestFilename: '20260610_003_normalize_catalog_item_categories.up.sql',
        latestAppliedAt: '2026-06-10T00:00:00.000Z'
      },
      mediaRoot: { path: '/var/bellfield/media', exists: true, writable: true, readable: true },
      backups: {
        ...currentBackups,
        latestRun: null,
        latestSuccessfulAt: null,
        latestSuccessfulBackupSetPath: null,
        stale: true
      },
      checks: [
        { key: 'database', ok: true },
        {
          key: 'backups',
          ok: false,
          detail: 'No successful backup has been recorded.'
        },
        {
          key: 'estimateTaxRates',
          ok: false,
          detail: '2 estimate(s) carry a stored sales tax rate above 25%.'
        }
      ]
    });
    renderSurface();

    expect(await screen.findByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('No successful backup has been recorded.')).toBeInTheDocument();
    expect(
      screen.getByText('2 estimate(s) carry a stored sales tax rate above 25%.')
    ).toBeInTheDocument();
  });

  it('hides the attention block when every check passes', async () => {
    renderSurface();
    await screen.findByText(/Reachable/);
    expect(screen.queryByText('Needs attention')).toBeNull();
  });

  it('degrades to unknown when the delivery status is not reachable', async () => {
    mockedCompanySettingsApi.getOfficeEstimateEmailDeliveryStatus.mockRejectedValue(
      new Error('Forbidden')
    );
    renderSurface();
    expect(await screen.findByText('Status unknown')).toBeInTheDocument();
    expect(screen.queryByText('Forbidden')).toBeNull();
  });
});
