
import { execFile } from "node:child_process";
import { createConnection } from "node:net";

type MonitorStatus = "UNKNOWN" | "UP" | "DEGRADED" | "DOWN";

interface Monitor {
  id: string;
  name: string;
  host: string;
  port: number;
  healthUrl: string;
  intervalMinutes: number;
}

interface ApiStatus {
  online: boolean | null;
  httpStatus: number | null;
  responseTimeMs: number | null;
  error: string | null;
}

interface MonitorState {
  id: string;
  name: string;
  host: string;
  port: number;
  status: MonitorStatus;
  ping: boolean | null;
  tcp: boolean | null;
  api: ApiStatus;
  consecutiveFailures: number;
  lastCheckedAt: string | null;
}

const FAILURE_THRESHOLD = 3;
const TIMEOUT_MS = 10_000;

const monitors: Monitor[] = [
  {
    id: "portfolio",
    name: "Portfolio",
    host: "217.13.105.132",
    port: 3000,
    healthUrl: "http://217.13.105.132:3000/api/health",
    intervalMinutes: 5,
  },
];

const states = new Map<string, MonitorState>();
const running = new Set<string>();

for (const monitor of monitors) {
  states.set(monitor.id, {
    id: monitor.id,
    name: monitor.name,
    host: monitor.host,
    port: monitor.port,
    status: "UNKNOWN",
    ping: null,
    tcp: null,
    api: {
      online: null,
      httpStatus: null,
      responseTimeMs: null,
      error: null,
    },
    consecutiveFailures: 0,
    lastCheckedAt: null,
  });
}

function checkPing(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const args =
      process.platform === "win32"
        ? ["-n", "1", "-w", "2000", host]
        : ["-c", "1", "-W", "2", host];

    execFile("ping", args, { timeout: 4000 }, (error) => {
      resolve(!error);
    });
  });
}

function checkTcp(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;

    const finish = (online: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(online);
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
      responseTimeMs: Math.round(performance.now() - start),
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

async function checkMonitor(monitor: Monitor): Promise<void> {
  if (running.has(monitor.id)) return;

  running.add(monitor.id);

  try {
    const state = states.get(monitor.id)!;

    const [ping, tcp, api] = await Promise.all([
      checkPing(monitor.host),
      checkTcp(monitor.host, monitor.port),
      checkHealth(monitor.healthUrl),
    ]);

    state.ping = ping;
    state.tcp = tcp;
    state.api = api;
    state.lastCheckedAt = new Date().toISOString();

    const previousStatus = state.status;
    if (api.online) {
      state.status = "UP";
      state.consecutiveFailures = 0;

      if (previousStatus === "DOWN") {
        await notify(`✅ ${monitor.name} API helyreállt!`);
      }
    } else {
      state.consecutiveFailures++;

      state.status =
        state.consecutiveFailures >= FAILURE_THRESHOLD
          ? "DOWN"
          : "DEGRADED";

      if (state.status === "DOWN" && previousStatus !== "DOWN") {
        await notify(
          `🚨 ${monitor.name} API nem elérhető!\n${api.error}`
        );
      }
    }

    console.log(`\n[${monitor.name}]`);
    console.log(`VPS Ping: ${ping ? "OK" : "FAILED"}`);
    console.log(`TCP Port ${monitor.port}: ${tcp ? "OPEN" : "CLOSED"}`);
    console.log(`API Health: ${api.online ? "UP" : "DOWN"}`);
    console.log(`Response Time: ${api.responseTimeMs ?? "-"}ms`);
    console.log(`Monitor Status: ${state.status}`);
  } finally {
    running.delete(monitor.id);
  }
}

export function getMonitorStatuses(): MonitorState[] {
  return Array.from(states.values());
}

let monitoringStarted = false;

export function startMonitoring(): void {
  if (monitoringStarted) return;

  monitoringStarted = true;
  console.log("VPS monitoring started");

  for (const monitor of monitors) {
    const run = () => {
      void checkMonitor(monitor).catch((error) => {
        console.error(`[${monitor.name}] Monitoring error:`, error);
      });
    };
    run();
    setInterval(run, monitor.intervalMinutes * 60_000);
  }
}
