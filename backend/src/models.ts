export type MonitorStatus = "UNKNOWN" | "UP" | "DEGRADED" | "DOWN";
export type HistoryPeriod = "24h" | "7d" | "30d";

export const PERIOD_MS: Record<HistoryPeriod, number> = {
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
};

export interface MonitorConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  healthUrl: string;
  intervalMinutes: number;
}

export interface ApiStatus {
  online: boolean | null;
  httpStatus: number | null;
  responseTimeMs: number | null;
  error: string | null;
}

export interface RecentCheck {
  checkedAt: string;
  status: MonitorStatus;
}

export interface MonitorState {
  id: string;
  name: string;
  host: string;
  port: number;
  status: MonitorStatus;
  ping: boolean | null;
  pingLatencyMs: number | null;
  tcp: boolean | null;
  tcpConnectTimeMs: number | null;
  api: ApiStatus;
  consecutiveFailures: number;
  lastCheckedAt: string | null;
  lastSuccessfulAt: string | null;
  recentChecks: RecentCheck[];
}

export interface MonitorView extends MonitorState {
  isStale: boolean;
}

export interface HistoryPoint {
  checkedAt: string;
  status: MonitorStatus;
  ping: boolean | null;
  pingLatencyMs: number | null;
  tcp: boolean | null;
  tcpConnectTimeMs: number | null;
  apiOnline: boolean | null;
  httpStatus: number | null;
  apiResponseTimeMs: number | null;
  error: string | null;
  consecutiveFailures: number;
}

export interface MonitorStats {
  monitorId: string;
  period: HistoryPeriod;
  sampleCount: number;
  uptimePercentage: number | null;
  averageApiResponseTimeMs: number | null;
  averagePingLatencyMs: number | null;
  averageTcpConnectTimeMs: number | null;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  methodology: string;
}

export interface Incident {
  id: number;
  monitorId: string;
  startedAt: string;
  endedAt: string | null;
  error: string | null;
}

export interface OverviewStats {
  period: HistoryPeriod;
  sampleCount: number;
  uptimePercentage: number | null;
  averageApiResponseTimeMs: number | null;
  openIncidentCount: number;
  methodology: string;
}
