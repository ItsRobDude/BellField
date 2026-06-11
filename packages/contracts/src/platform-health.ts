export interface HealthStatus {
  status: 'ok' | 'degraded';
  timestamp: string;
}

export interface VersionInfo {
  name: string;
  version: string;
}
