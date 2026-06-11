// Owner/Admin-gated system diagnostics and support export. Deliberately carries NO customer/job/
// business data and NO secrets — only health, versions, counts, timings, and the PRESENCE or
// non-secret values of configuration. See docs/m10-trust-admin-plan.md §4–§5.

/** One green/red readiness check for a simple status UI. */
export interface SystemDiagnosticsCheck {
  key: string;
  ok: boolean;
  detail?: string;
}

export interface BackupRunSummary {
  status: 'running' | 'succeeded' | 'failed';
  startedAt: string;
  completedAt: string | null;
  backupSetPath: string | null;
  errorMessage?: string;
}

export interface BackupDiagnosticsSummary {
  enabled: boolean;
  backupRootPath: string;
  retentionCount: number;
  staleAfterHours: number;
  latestRun: BackupRunSummary | null;
  latestSuccessfulAt: string | null;
  latestSuccessfulBackupSetPath: string | null;
  stale: boolean;
  error?: string;
}

export interface LicenseDiagnosticsSummary {
  required: boolean;
  path: string | null;
  status: 'notRequired' | 'valid' | 'missing' | 'invalid';
  licenseId?: string;
  shopName?: string;
  issuedAt?: string;
  updateWindowEnd?: string;
  message?: string;
}

/** Health/readiness snapshot for the System surface. Every sub-check is best-effort: a failure
 * sets its `ok=false` (+ `error`) rather than failing the whole response. */
export interface SystemDiagnosticsResponse {
  serverTime: string;
  app: {
    name: string;
    version: string;
    nodeEnv: string;
  };
  database: {
    reachable: boolean;
    /** Milliseconds for a `select 1`, or null when unreachable. */
    latencyMs: number | null;
    /** Sanitized message when unreachable (never the connection string). */
    error?: string;
  };
  migrations: {
    appliedCount: number;
    latestFilename: string | null;
    latestAppliedAt: string | null;
  };
  mediaRoot: {
    /** The configured root path (a path, not a secret). */
    path: string;
    exists: boolean;
    writable: boolean;
    readable: boolean;
    error?: string;
  };
  backups: BackupDiagnosticsSummary;
  license: LicenseDiagnosticsSummary;
  /** Rollup of the above as flat checks for a green/red UI. */
  checks: SystemDiagnosticsCheck[];
}

/** Non-secret configuration summary for the support bundle. Reports presence and non-secret
 * values only — never credentials or token secrets. */
export interface SupportExportConfigSummary {
  nodeEnv: string;
  port: number;
  /** Host:port parsed from DATABASE_URL — never the credentials. */
  databaseHost: string | null;
  databaseName: string | null;
  mediaRootPath: string;
  mediaMaxBytes: number;
  /** Whether a media token secret is configured — never its value. */
  mediaTokenSecretConfigured: boolean;
  backupEnabled: boolean;
  backupRootPath: string;
  backupRetentionCount: number;
  backupStaleAfterHours: number;
  licenseRequired: boolean;
  licensePath: string | null;
}

/** Local-first support bundle: a privacy-safe status + config snapshot the operator downloads. */
export interface SupportExportBundle {
  generatedAt: string;
  /** Who exported it (accountability) — an employee id, not customer data. */
  generatedByEmployeeId: string;
  diagnostics: SystemDiagnosticsResponse;
  config: SupportExportConfigSummary;
}
