import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as systemApi from '@/lib/system-diagnostics-api';
import { OfficeSystemSurface } from './office-system-surface';

vi.mock('@/lib/system-diagnostics-api', () => ({
  getSystemDiagnostics: vi.fn(),
  downloadSupportExport: vi.fn()
}));

const mockedApi = vi.mocked(systemApi);

function arrange() {
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
});
