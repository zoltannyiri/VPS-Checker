import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  HistoryPoint,
  HistoryPeriod,
  Incident,
  MonitorState,
  MonitorStats,
  MonitorStatus,
  OverviewStats,
  PERIOD_MS,
  RecentCheck,
} from "./models.js";

interface CheckRow {
  checked_at: string;
  status: MonitorStatus;
  ping_online: number | null;
  ping_latency_ms: number | null;
  tcp_online: number | null;
  tcp_connect_time_ms: number | null;
  api_online: number | null;
  http_status: number | null;
  api_response_time_ms: number | null;
  error: string | null;
  consecutive_failures: number;
}

interface AggregateRow {
  sample_count: number;
  online_count: number;
  avg_api_ms: number | null;
  avg_ping_ms: number | null;
  avg_tcp_ms: number | null;
  first_observed_at: string | null;
  last_observed_at: string | null;
}

interface IncidentRow {
  id: number;
  monitor_id: string;
  started_at: string;
  ended_at: string | null;
  error: string | null;
}

const DATABASE_PATH = fileURLToPath(
  new URL("../data/monitoring.sqlite", import.meta.url),
);
const UPTIME_METHODOLOGY =
  "Sikeres HTTP health ellenőrzések / összes eltárolt HTTP health ellenőrzés az időszakban.";

function nullableBoolean(value: number | null): boolean | null {
  return value === null ? null : value === 1;
}

function roundNullable(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

export class MonitorStorage {
  private readonly database: DatabaseSync;

  constructor(path = DATABASE_PATH) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
    this.cleanup();
  }

  recordCheck(state: MonitorState): void {
    this.database
      .prepare(
        `INSERT INTO checks (
          monitor_id, checked_at, status, ping_online, ping_latency_ms,
          tcp_online, tcp_connect_time_ms, api_online, http_status,
          api_response_time_ms, error, consecutive_failures
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        state.id,
        state.lastCheckedAt,
        state.status,
        state.ping === null ? null : Number(state.ping),
        state.pingLatencyMs,
        state.tcp === null ? null : Number(state.tcp),
        state.tcpConnectTimeMs,
        state.api.online === null ? null : Number(state.api.online),
        state.api.httpStatus,
        state.api.responseTimeMs,
        state.api.error,
        state.consecutiveFailures,
      );
  }

  getLatestCheck(monitorId: string): HistoryPoint | null {
    const row = this.database
      .prepare(
        "SELECT * FROM checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 1",
      )
      .get(monitorId) as unknown as CheckRow | undefined;
    return row ? this.mapCheck(row) : null;
  }

  getLastSuccessfulAt(monitorId: string): string | null {
    const row = this.database
      .prepare(
        "SELECT checked_at FROM checks WHERE monitor_id = ? AND api_online = 1 ORDER BY checked_at DESC LIMIT 1",
      )
      .get(monitorId) as { checked_at: string } | undefined;
    return row?.checked_at ?? null;
  }

  getRecentChecks(monitorId: string, limit = 24): RecentCheck[] {
    const rows = this.database
      .prepare(
        "SELECT checked_at, status FROM checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT ?",
      )
      .all(monitorId, limit) as unknown as Array<{
      checked_at: string;
      status: MonitorStatus;
    }>;
    return rows
      .reverse()
      .map((row) => ({ checkedAt: row.checked_at, status: row.status }));
  }

  getHistory(monitorId: string, period: HistoryPeriod): HistoryPoint[] {
    const since = new Date(Date.now() - PERIOD_MS[period]).toISOString();
    const rows = this.database
      .prepare(
        "SELECT * FROM checks WHERE monitor_id = ? AND checked_at >= ? ORDER BY checked_at ASC LIMIT 10000",
      )
      .all(monitorId, since) as unknown as CheckRow[];
    return rows.map((row) => this.mapCheck(row));
  }

  getMonitorStats(monitorId: string, period: HistoryPeriod): MonitorStats {
    const aggregate = this.aggregate(
      "WHERE monitor_id = ? AND checked_at >= ?",
      [monitorId, new Date(Date.now() - PERIOD_MS[period]).toISOString()],
    );
    return {
      monitorId,
      period,
      sampleCount: aggregate.sample_count,
      uptimePercentage: this.uptime(aggregate),
      averageApiResponseTimeMs: roundNullable(aggregate.avg_api_ms),
      averagePingLatencyMs: roundNullable(aggregate.avg_ping_ms),
      averageTcpConnectTimeMs: roundNullable(aggregate.avg_tcp_ms),
      firstObservedAt: aggregate.first_observed_at,
      lastObservedAt: aggregate.last_observed_at,
      methodology: UPTIME_METHODOLOGY,
    };
  }

  getOverview(period: HistoryPeriod): OverviewStats {
    const aggregate = this.aggregate("WHERE checked_at >= ?", [
      new Date(Date.now() - PERIOD_MS[period]).toISOString(),
    ]);
    return {
      period,
      sampleCount: aggregate.sample_count,
      uptimePercentage: this.uptime(aggregate),
      averageApiResponseTimeMs: roundNullable(aggregate.avg_api_ms),
      openIncidentCount: this.getOpenIncidentCount(),
      methodology: UPTIME_METHODOLOGY,
    };
  }

  openIncident(
    monitorId: string,
    startedAt: string,
    error: string | null,
  ): void {
    const open = this.database
      .prepare(
        "SELECT id FROM incidents WHERE monitor_id = ? AND ended_at IS NULL LIMIT 1",
      )
      .get(monitorId);
    if (open) return;
    this.database
      .prepare(
        "INSERT INTO incidents (monitor_id, started_at, error) VALUES (?, ?, ?)",
      )
      .run(monitorId, startedAt, error);
  }

  closeIncident(monitorId: string, endedAt: string): void {
    this.database
      .prepare(
        "UPDATE incidents SET ended_at = ? WHERE monitor_id = ? AND ended_at IS NULL",
      )
      .run(endedAt, monitorId);
  }

  getIncidents(period: HistoryPeriod, monitorId?: string): Incident[] {
    const since = new Date(Date.now() - PERIOD_MS[period]).toISOString();
    const rows = monitorId
      ? this.database
          .prepare(
            `SELECT * FROM incidents
             WHERE monitor_id = ? AND (ended_at IS NULL OR ended_at >= ?)
             ORDER BY started_at DESC LIMIT 500`,
          )
          .all(monitorId, since)
      : this.database
          .prepare(
            `SELECT * FROM incidents
             WHERE ended_at IS NULL OR ended_at >= ?
             ORDER BY started_at DESC LIMIT 500`,
          )
          .all(since);
    return (rows as unknown as IncidentRow[]).map((row) => ({
      id: row.id,
      monitorId: row.monitor_id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      error: row.error,
    }));
  }

  private getOpenIncidentCount(): number {
    const row = this.database
      .prepare("SELECT COUNT(*) AS count FROM incidents WHERE ended_at IS NULL")
      .get() as { count: number };
    return row.count;
  }

  private aggregate(where: string, parameters: Array<string>): AggregateRow {
    return this.database
      .prepare(
        `SELECT
          COUNT(*) AS sample_count,
          COALESCE(SUM(CASE WHEN api_online = 1 THEN 1 ELSE 0 END), 0) AS online_count,
          AVG(api_response_time_ms) AS avg_api_ms,
          AVG(ping_latency_ms) AS avg_ping_ms,
          AVG(tcp_connect_time_ms) AS avg_tcp_ms,
          MIN(checked_at) AS first_observed_at,
          MAX(checked_at) AS last_observed_at
        FROM checks ${where}`,
      )
      .get(...parameters) as unknown as AggregateRow;
  }

  private uptime(aggregate: AggregateRow): number | null {
    if (aggregate.sample_count === 0) return null;
    return (
      Math.round((aggregate.online_count / aggregate.sample_count) * 10_000) /
      100
    );
  }

  private mapCheck(row: CheckRow): HistoryPoint {
    return {
      checkedAt: row.checked_at,
      status: row.status,
      ping: nullableBoolean(row.ping_online),
      pingLatencyMs: row.ping_latency_ms,
      tcp: nullableBoolean(row.tcp_online),
      tcpConnectTimeMs: row.tcp_connect_time_ms,
      apiOnline: nullableBoolean(row.api_online),
      httpStatus: row.http_status,
      apiResponseTimeMs: row.api_response_time_ms,
      error: row.error,
      consecutiveFailures: row.consecutive_failures,
    };
  }

  private cleanup(): void {
    const checksCutoff = new Date(
      Date.now() - 90 * 24 * 60 * 60 * 1_000,
    ).toISOString();
    const incidentsCutoff = new Date(
      Date.now() - 365 * 24 * 60 * 60 * 1_000,
    ).toISOString();
    this.database
      .prepare("DELETE FROM checks WHERE checked_at < ?")
      .run(checksCutoff);
    this.database
      .prepare(
        "DELETE FROM incidents WHERE ended_at IS NOT NULL AND ended_at < ?",
      )
      .run(incidentsCutoff);
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        monitor_id TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('UNKNOWN', 'UP', 'DEGRADED', 'DOWN')),
        ping_online INTEGER,
        ping_latency_ms REAL,
        tcp_online INTEGER,
        tcp_connect_time_ms REAL,
        api_online INTEGER,
        http_status INTEGER,
        api_response_time_ms REAL,
        error TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS checks_monitor_time_idx
        ON checks(monitor_id, checked_at DESC);
      CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        monitor_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS incidents_monitor_time_idx
        ON incidents(monitor_id, started_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS incidents_one_open_idx
        ON incidents(monitor_id) WHERE ended_at IS NULL;
    `);
  }
}

export const monitorStorage = new MonitorStorage();
