import { execFile } from "node:child_process";
import { createConnection } from "node:net";
import {
  ApiStatus,
  MonitorConfig,
  MonitorState,
  MonitorView,
} from "./models.js";
import { monitorStorage } from "./storage.js";

interface PingResult {
  online: boolean;
  latencyMs: number | null;
}

interface TcpResult {
  online: boolean;
  connectTimeMs: number | null;
}

const FAILURE_THRESHOLD = 3;
const TIMEOUT_MS = 10_000;
const RECENT_CHECK_LIMIT = 24;

const monitors: MonitorConfig[] = [
  {
    id: "portfolio",
    name: "Portfolio",
    host: "217.13.105.132",
    port: 3000,
    healthUrl: "http://217.13.105.132:3000/api/health",
    intervalMinutes: 0.25,
  },
  {
    id: "turazzvelunk",
    name: "Turazzvelunk",
    host: "217.13.104.241",
    port: 5000,
    healthUrl: "http://217.13.104.241:5000/api/health",
    intervalMinutes: 0.25,
  },
];

const states = new Map<string, MonitorState>();
const running = new Set<string>();

for (const monitor of monitors) {
  validateMonitor(monitor);
  const latest = monitorStorage.getLatestCheck(monitor.id);
  states.set(monitor.id, {
    id: monitor.id,
    name: monitor.name,
    host: monitor.host,
    port: monitor.port,
    status: latest?.status ?? "UNKNOWN",
    ping: latest?.ping ?? null,
    pingLatencyMs: latest?.pingLatencyMs ?? null,
    tcp: latest?.tcp ?? null,
    tcpConnectTimeMs: latest?.tcpConnectTimeMs ?? null,
    api: {
      online: latest?.apiOnline ?? null,
      httpStatus: latest?.httpStatus ?? null,
      responseTimeMs: latest?.apiResponseTimeMs ?? null,
      error: latest?.error ?? null,
    },
    consecutiveFailures: latest?.consecutiveFailures ?? 0,
    lastCheckedAt: latest?.checkedAt ?? null,
    lastSuccessfulAt: monitorStorage.getLastSuccessfulAt(monitor.id),
    recentChecks: monitorStorage.getRecentChecks(
      monitor.id,
      RECENT_CHECK_LIMIT,
    ),
  });
}

function validateMonitor(monitor: MonitorConfig): void {
  const url = new URL(monitor.healthUrl);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.hostname !== monitor.host
  ) {
    throw new Error(`Invalid health URL for monitor ${monitor.id}`);
  }
  if (
    !Number.isInteger(monitor.port) ||
    monitor.port < 1 ||
    monitor.port > 65_535
  ) {
    throw new Error(`Invalid TCP port for monitor ${monitor.id}`);
  }
}

function checkPing(host: string): Promise<PingResult> {
  return new Promise((resolve) => {
    const args =
      process.platform === "win32"
        ? ["-n", "1", "-w", "2000", host]
        : ["-c", "1", "-W", "2", host];

    execFile(
      "ping",
      args,
      { timeout: 4_000, encoding: "utf8" },
      (error, stdout) => {
        if (error) {
          resolve({ online: false, latencyMs: null });
          return;
        }

        const match = stdout.match(
          /(?:time|idő)?[=<]\s*(\d+(?:[.,]\d+)?)\s*ms/i,
        );
        const parsed = match?.[1]
          ? Number.parseFloat(match[1].replace(",", "."))
          : Number.NaN;
        resolve({
          online: true,
          latencyMs: Number.isFinite(parsed) ? parsed : null,
        });
      },
    );
  });
}

function checkTcp(host: string, port: number): Promise<TcpResult> {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const socket = createConnection({ host, port });
    let settled = false;

    const finish = (online: boolean) => {
      if (settled) return;
      settled = true;
      const connectTimeMs = online
        ? Math.round((performance.now() - startedAt) * 10) / 10
        : null;
      socket.destroy();
      resolve({ online, connectTimeMs });
    };

    socket.setTimeout(5000);

    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

async function checkHealth(url: string): Promise<ApiStatus> {
  const start = performance.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const body: unknown = await response.json().catch(() => null);

    const online =
      response.ok &&
      typeof body === "object" &&
      body !== null &&
      "status" in body &&
      body.status === "ok";

    return {
      online,
      httpStatus: response.status,
      responseTimeMs: Math.round((performance.now() - start) * 10) / 10,
      error: online
        ? null
        : response.ok
          ? "Invalid health response"
          : `HTTP ${response.status}`,
    };
  } catch (error: unknown) {
    return {
      online: false,
      httpStatus: null,
      responseTimeMs: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function notify(message: string): Promise<void> {
  console.log(`[NOTIFICATION] ${message}`);
}

async function checkMonitor(monitor: MonitorConfig): Promise<void> {
  if (running.has(monitor.id)) return;

  running.add(monitor.id);

  try {
    const state = states.get(monitor.id);
    if (!state) throw new Error(`Missing state for monitor ${monitor.id}`);

    const [ping, tcp, api] = await Promise.all([
      checkPing(monitor.host),
      checkTcp(monitor.host, monitor.port),
      checkHealth(monitor.healthUrl),
    ]);

    const checkedAt = new Date().toISOString();
    state.ping = ping.online;
    state.pingLatencyMs = ping.latencyMs;
    state.tcp = tcp.online;
    state.tcpConnectTimeMs = tcp.connectTimeMs;
    state.api = api;
    state.lastCheckedAt = checkedAt;

    const previousStatus = state.status;
    if (api.online) {
      state.status = "UP";
      state.consecutiveFailures = 0;
      state.lastSuccessfulAt = checkedAt;

      if (previousStatus === "DOWN") {
        monitorStorage.closeIncident(monitor.id, checkedAt);
        await notify(`✅ ${monitor.name} API helyreállt!`);
      }
    } else {
      state.consecutiveFailures++;

      state.status =
        state.consecutiveFailures >= FAILURE_THRESHOLD ? "DOWN" : "DEGRADED";

      if (state.status === "DOWN" && previousStatus !== "DOWN") {
        monitorStorage.openIncident(monitor.id, checkedAt, api.error);
        await notify(
          `🚨 ${monitor.name} API nem elérhető!\n${api.error ?? "Unknown error"}`,
        );
      }
    }

    state.recentChecks.push({ checkedAt, status: state.status });
    state.recentChecks = state.recentChecks.slice(-RECENT_CHECK_LIMIT);
    monitorStorage.recordCheck(state);

    console.log(`\n[${monitor.name}]`);
    console.log(
      `VPS Ping: ${ping.online ? `${ping.latencyMs ?? "?"}ms` : "FAILED"}`,
    );
    console.log(
      `TCP Port ${monitor.port}: ${tcp.online ? `${tcp.connectTimeMs ?? "?"}ms` : "CLOSED"}`,
    );
    console.log(`API Health: ${api.online ? "UP" : "DOWN"}`);
    console.log(`Response Time: ${api.responseTimeMs ?? "-"}ms`);
    console.log(`Monitor Status: ${state.status}`);
  } finally {
    running.delete(monitor.id);
  }
}

export function getMonitorStatuses(): MonitorView[] {
  return monitors.map((monitor) => {
    const state = states.get(monitor.id);
    if (!state) throw new Error(`Missing state for monitor ${monitor.id}`);
    const checkedAt = state.lastCheckedAt
      ? new Date(state.lastCheckedAt).getTime()
      : null;
    const staleAfterMs = Math.max(
      monitor.intervalMinutes * 2.5 * 60_000,
      15 * 60_000,
    );

    return {
      ...state,
      api: { ...state.api },
      recentChecks: [...state.recentChecks],
      isStale: checkedAt !== null && Date.now() - checkedAt > staleAfterMs,
    };
  });
}

export function hasMonitor(monitorId: string): boolean {
  return states.has(monitorId);
}

let monitoringStarted = false;

export function startMonitoring(): void {
  if (monitoringStarted) return;

  monitoringStarted = true;
  console.log("VPS monitoring started");

  for (const monitor of monitors) {
    const run = () => {
      void checkMonitor(monitor).catch((error: unknown) => {
        console.error(`[${monitor.name}] Monitoring error:`, error);
      });
    };
    run();
    setInterval(run, monitor.intervalMinutes * 60_000);
  }
}
