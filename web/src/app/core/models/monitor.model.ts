export type MonitorStatus = 'UNKNOWN' | 'UP' | 'DEGRADED' | 'DOWN';
export type HistoryPeriod = '24h' | '7d' | '30d';

export interface ApiStatus {
  online: boolean | null;
  httpStatus: number | null;
  responseTimeMs: number | null;
  error: string | null;
}

export interface Monitor {
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
  isStale: boolean;
}

export interface RecentCheck {
  checkedAt: string;
  status: MonitorStatus;
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

export interface HistoryResponse {
  monitorId: string;
  period: HistoryPeriod;
  points: HistoryPoint[];
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

export interface ChartPoint {
  timestamp: string;
  value: number;
}
