'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { EstimateEmailDeliveryStatus } from '@bellfield/contracts';
import { getOfficeEstimateEmailDeliveryStatus } from '@/lib/operations-company-settings-api';
import {
  downloadSupportExport,
  getSystemDiagnostics,
  type SystemDiagnosticsResponse
} from '@/lib/system-diagnostics-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type OfficeSystemSurfaceProps = {
  apiBaseUrl: string;
  sessionToken: string;
  /** Whether the actor may download the support bundle (`supportLogsBackups:export`). */
  canExportSupport: boolean;
};

const cardStyle: CSSProperties = {
  border: '1px solid #d7dde5',
  borderRadius: 8,
  padding: '0.75rem 1rem',
  minWidth: 220,
  background: '#ffffff'
};

const gridStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  marginTop: 12
};

const labelStyle: CSSProperties = { fontSize: 12, color: '#5b6672', textTransform: 'uppercase' };
const valueStyle: CSSProperties = { fontSize: 14, color: '#1f2933', marginTop: 4 };

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Never';
  }
  return new Date(value).toLocaleString();
}

function backupStatusText(backups: SystemDiagnosticsResponse['backups']): string {
  if (!backups.enabled) {
    return 'Disabled';
  }
  if (backups.error) {
    return 'Needs attention';
  }
  if (backups.latestRun?.status === 'running') {
    return 'Running';
  }
  if (backups.latestRun?.status === 'failed') {
    return 'Last run failed';
  }
  if (backups.stale) {
    return 'Stale';
  }
  return 'Current';
}

function backupStatusOk(backups: SystemDiagnosticsResponse['backups']): boolean {
  return (
    backups.enabled && !backups.error && !backups.stale && backups.latestRun?.status !== 'failed'
  );
}

function licenseStatusText(license: SystemDiagnosticsResponse['license']): string {
  if (license.status === 'notRequired') {
    return 'Not required';
  }
  if (license.entitlementState === 'paidOperational') {
    return 'Licensed';
  }
  if (license.entitlementState === 'trialOperational') {
    return 'Trial';
  }
  if (license.entitlementState === 'trialExpiredDataOnly') {
    return 'Trial expired';
  }
  if (license.entitlementState === 'refundedDataOnly') {
    return 'Data-only';
  }
  if (license.entitlementState === 'licenseRecovery') {
    return 'Recovery needed';
  }
  if (license.status === 'valid') {
    if (license.licenseKind === 'dataOnly') {
      return 'Data-only';
    }
    if (license.licenseKind === 'trial') {
      return 'Trial';
    }
    return 'Licensed';
  }
  if (license.status === 'missing') {
    return 'Missing';
  }
  return 'Needs attention';
}

function licenseStatusOk(license: SystemDiagnosticsResponse['license']): boolean {
  return license.status === 'notRequired' || license.operational;
}

// Any red rollup check renders here, so data-audit checks that have no card
// of their own (e.g. legacy estimate tax rates) are still owner-visible
// instead of living only in the support bundle.
function FailingChecks({ checks }: { checks: SystemDiagnosticsResponse['checks'] }) {
  const failing = checks.filter((check) => !check.ok);
  if (failing.length === 0) {
    return null;
  }
  return (
    <div
      style={{ ...cardStyle, marginTop: 12, borderColor: '#f0c4bd' }}
      aria-label="Needs attention"
    >
      <div style={labelStyle}>Needs attention</div>
      {failing.map((check) => (
        <div key={check.key} style={valueStyle}>
          <StatusDot ok={false} />
          {check.detail ?? check.key}
        </div>
      ))}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        marginRight: 8,
        background: ok ? '#1e9e62' : '#c0392b'
      }}
    />
  );
}

// Read-only System surface (M10 slice 1): owner/admin readiness status — DB, migrations, media
// root, app version — plus a privacy-safe support bundle download. No customer/job data.
export function OfficeSystemSurface({
  apiBaseUrl,
  sessionToken,
  canExportSupport
}: OfficeSystemSurfaceProps) {
  const [diagnostics, setDiagnostics] = useState<SystemDiagnosticsResponse | null>(null);
  const [estimateEmailStatus, setEstimateEmailStatus] =
    useState<EstimateEmailDeliveryStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setDiagnostics(await getSystemDiagnostics({ apiBaseUrl, sessionToken }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load system status.');
    } finally {
      setIsLoading(false);
    }
    // Loaded separately so a delivery-status failure (e.g. role without
    // settings access) degrades to "unknown" instead of failing the surface.
    try {
      const response = await getOfficeEstimateEmailDeliveryStatus({ apiBaseUrl, sessionToken });
      setEstimateEmailStatus(response.deliveryStatus);
    } catch {
      setEstimateEmailStatus(null);
    }
  }, [apiBaseUrl, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportSupportBundle() {
    setIsExporting(true);
    setErrorMessage(null);
    try {
      const blob = await downloadSupportExport({ apiBaseUrl, sessionToken });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bellfield-support-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to export the support bundle.'
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section style={styles.workspacePanel} aria-label="System">
      <div style={styles.row}>
        <h1 style={styles.heading}>System</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            style={styles.button}
            disabled={isLoading}
            onClick={() => void load()}
          >
            {isLoading ? 'Checking…' : 'Refresh'}
          </button>
          {canExportSupport ? (
            <button
              type="button"
              style={styles.button}
              disabled={isExporting || !diagnostics}
              onClick={() => void exportSupportBundle()}
            >
              {isExporting ? 'Preparing…' : 'Download support bundle'}
            </button>
          ) : null}
        </div>
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}

      {diagnostics ? (
        <>
          <div style={gridStyle}>
            <div style={cardStyle}>
              <div style={labelStyle}>Database</div>
              <div style={valueStyle}>
                <StatusDot ok={diagnostics.database.reachable} />
                {diagnostics.database.reachable
                  ? `Reachable (${diagnostics.database.latencyMs ?? '—'} ms)`
                  : (diagnostics.database.error ?? 'Unreachable')}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Migrations</div>
              <div style={valueStyle}>
                <StatusDot ok={diagnostics.migrations.appliedCount > 0} />
                {diagnostics.migrations.appliedCount} applied
              </div>
              <div style={{ ...valueStyle, fontSize: 12, color: '#5b6672' }}>
                {diagnostics.migrations.latestFilename ?? 'none'}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Media storage</div>
              <div style={valueStyle}>
                <StatusDot ok={diagnostics.mediaRoot.writable && diagnostics.mediaRoot.readable} />
                {diagnostics.mediaRoot.writable && diagnostics.mediaRoot.readable
                  ? 'Read/write OK'
                  : (diagnostics.mediaRoot.error ?? 'Not accessible')}
              </div>
              <div style={{ ...valueStyle, fontSize: 12, color: '#5b6672' }}>
                {diagnostics.mediaRoot.path}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Backups</div>
              <div style={valueStyle}>
                <StatusDot ok={backupStatusOk(diagnostics.backups)} />
                {backupStatusText(diagnostics.backups)}
              </div>
              <div style={{ ...valueStyle, fontSize: 12, color: '#5b6672' }}>
                Last successful: {formatDateTime(diagnostics.backups.latestSuccessfulAt)}
              </div>
              <div style={{ ...valueStyle, fontSize: 12, color: '#5b6672' }}>
                {diagnostics.backups.backupRootPath}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>License</div>
              <div style={valueStyle}>
                <StatusDot ok={licenseStatusOk(diagnostics.license)} />
                {licenseStatusText(diagnostics.license)}
              </div>
              <div style={{ ...valueStyle, fontSize: 12, color: '#5b6672' }}>
                {diagnostics.license.status === 'valid' ? (
                  <>
                    {diagnostics.license.shopName}
                    {diagnostics.license.entitlementState === 'trialOperational' &&
                    diagnostics.license.operationEnd
                      ? ` · Trial through ${diagnostics.license.operationEnd}`
                      : diagnostics.license.updateWindowEnd
                        ? ` · Updates through ${diagnostics.license.updateWindowEnd}`
                        : ' · Export/recovery only'}
                    {diagnostics.license.message ? ` · ${diagnostics.license.message}` : null}
                  </>
                ) : (
                  (diagnostics.license.message ?? diagnostics.license.path ?? 'Source/dev runtime')
                )}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>App</div>
              <div style={valueStyle}>
                {diagnostics.app.name} v{diagnostics.app.version}
              </div>
              <div style={{ ...valueStyle, fontSize: 12, color: '#5b6672' }}>
                {diagnostics.app.releaseDate
                  ? `Release ${diagnostics.app.releaseDate}`
                  : diagnostics.app.buildKind}
                {' · '}
                {diagnostics.app.nodeEnv} · {new Date(diagnostics.serverTime).toLocaleString()}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Estimate email</div>
              <div style={valueStyle}>
                {estimateEmailStatus ? (
                  <>
                    <StatusDot ok={estimateEmailStatus.ready} />
                    {estimateEmailStatus.ready
                      ? 'Ready'
                      : estimateEmailStatus.configured
                        ? 'Needs attention'
                        : 'Not configured'}
                  </>
                ) : (
                  'Status unknown'
                )}
              </div>
              {estimateEmailStatus && !estimateEmailStatus.ready ? (
                <div style={{ ...valueStyle, fontSize: 12, color: '#5b6672' }}>
                  {estimateEmailStatus.message}
                </div>
              ) : null}
            </div>
          </div>
          <FailingChecks checks={diagnostics.checks} />
        </>
      ) : isLoading ? (
        <p style={styles.notice}>Checking system status…</p>
      ) : null}
    </section>
  );
}
