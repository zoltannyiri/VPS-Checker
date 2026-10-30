import { execFile } from "node:child_process";
import { sendMail } from "./mailer.js";
import { sendMonitorAlert } from "./alert-email.js";
import { createConnection } from "node:net";
import {
  ApiStatus,
  MonitorConfig,
  MonitorState,
  MonitorView,
} from "./models.js";
import { monitorStorage } from "./storage.js";
import "dotenv/config";
import { runSshDiagnostics } from "./ssh-diagnostics.js";

interface PingResult {
  online: boolean;
  latencyMs: number | null;
}

interface TcpResult {
  online: boolean;
  connectTimeMs: number | null;
}

const FAILURE_THRESHOLD = 1; // ennyi sikertelen próbálkozás után küld emailt
const TIMEOUT_MS = 10_000;
const RECENT_CHECK_LIMIT = 24;

const monitors: MonitorConfig[] = [
  {
    id: "portfolio",
    name: "Portfolio",
    host: process.env.PORTFOLIO_HOST!,
    port: 3000,
    healthUrl: process.env.PORTFOLIO_HEALTH_URL!,
    intervalMinutes: 5,
  },
  {
    id: "turazzvelunk",
    name: "Turazzvelunk",
    host: process.env.TURAZZVELUNK_HOST!,
    port: 5000,
    healthUrl: process.env.TURAZZVELUNK_HEALTH_URL!,
    intervalMinutes: 5,
  },
  {
    id: "spendfox",
    name: "Spendfox",
    host: process.env.SPENDFOX_HOST!,
    port: 5000,
    healthUrl: process.env.SPENDFOX_HEALTH_URL!,
    intervalMinutes: 5,
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

  const recipient = process.env.ALERT_EMAIL_TO;

  if (!recipient) {
    console.warn("[EMAIL] Nincs beállítva ALERT_EMAIL_TO.");
    return;
  }

  const isDown = message.startsWith("🚨");

  const subject = isDown
    ? "VPS-Checker | Szolgáltatás leállt"
    : "VPS-Checker | Szolgáltatás helyreállt";

  try {
    await sendMail({
      to: recipient,
      subject,
      text: message,
    });

    console.log(`[EMAIL] Sikeres küldés: ${recipient}`);
  } catch (error) {
    console.error("[EMAIL] Küldési hiba:", error);
  }
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

    let pendingAlert: {
      kind: "DOWN" | "RECOVERED";
      startedAt: string | null;
      error: string | null;
    } | null = null;

    if (api.online) {
      state.status = "UP";
      state.consecutiveFailures = 0;
      state.lastSuccessfulAt = checkedAt;

      if (previousStatus === "DOWN") {
        const openIncident = monitorStorage
          .getIncidents("30d", monitor.id)
          .find((incident) => incident.endedAt === null);

        monitorStorage.closeIncident(monitor.id, checkedAt);

        pendingAlert = {
          kind: "RECOVERED",
          startedAt: openIncident?.startedAt ?? null,
          error: openIncident?.error ?? null,
        };
      }
    } else {
      state.consecutiveFailures++;

      state.status =
        state.consecutiveFailures >= FAILURE_THRESHOLD
          ? "DOWN"
          : "DEGRADED";

      if (state.status === "DOWN" && previousStatus !== "DOWN") {
        const basicDiagnosis = diagnoseFailure(monitor, ping, tcp, api);
        const sshDiagnosis = await runSshDiagnostics(monitor.id);

        const diagnosis = [
          basicDiagnosis,
          sshDiagnosis,
        ].filter(Boolean).join("\n\n");

        monitorStorage.openIncident(
          monitor.id,
          checkedAt,
          diagnosis,
        );

        pendingAlert = {
          kind: "DOWN",
          startedAt: checkedAt,
          error: diagnosis,
        };
      }
    }

    state.recentChecks.push({ checkedAt, status: state.status });
    state.recentChecks = state.recentChecks.slice(-RECENT_CHECK_LIMIT);
    monitorStorage.recordCheck(state);

    if (pendingAlert) {
      await sendMonitorAlert({
        ...pendingAlert,
        monitor,
        state,
        detectedAt: checkedAt,
      });
    }

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


function diagnoseFailure( monitor: MonitorConfig, ping: PingResult, tcp: TcpResult, api: ApiStatus ): string {
  const detail = api.error ?? "Ismeretlen HTTP-hiba";

  if (!ping.online && !tcp.online) {
    return (
      "A szerver nem válaszol ICMP pingre, és a " +
      `${monitor.port}-es TCP-port sem érhető el. ` +
      "Lehetséges hálózati hiba, VPS-leállás vagy tűzfalszabály. " +
      `HTTP: ${detail}. A pontos ok még nem bizonyított.`
    );
  }

  if (ping.online && !tcp.online) {
    return (
      "A VPS pingre válaszol, de a " +
      `${monitor.port}-es TCP-port nem elérhető. ` +
      "Lehetséges leállt alkalmazás, nem figyelő port vagy tűzfalhiba. " +
      `HTTP: ${detail}.`
    );
  }

  if (api.httpStatus === 502) {
    return (
      "HTTP 502 Bad Gateway. A HTTP-kiszolgáló vagy proxy " +
      "nem kapott megfelelő választ a háttérszolgáltatástól. " +
      "Lehetséges upstream-, alkalmazás- vagy proxyhiba. " +
      "A pontos okhoz Nginx- és alkalmazásnapló szükséges."
    );
  }

  if (api.httpStatus === 503) {
    return (
      "HTTP 503 Service Unavailable. A szolgáltatás jelenleg " +
      "nem tudja kiszolgálni a kérést. Lehetséges túlterhelés, " +
      "karbantartás vagy nem elérhető upstream."
    );
  }

  if (api.httpStatus !== null && api.httpStatus >= 500) {
    return (
      `HTTP ${api.httpStatus}: szerveroldali hiba. ` +
      "A pontos ok az alkalmazás- vagy proxynaplókból állapítható meg."
    );
  }

  if (api.httpStatus === 404) {
    return (
      "HTTP 404: a health endpoint nem található. " +
      "Lehetséges hibás útvonal, deployment vagy proxykonfiguráció."
    );
  }

  if (api.httpStatus !== null && api.httpStatus >= 400) {
    return (
      `HTTP ${api.httpStatus}: a health endpoint hibával válaszolt. ` +
      `Részlet: ${detail}.`
    );
  }

  if (tcp.online && api.httpStatus === null) {
    return (
      "A TCP-port elérhető, de HTTP-válasz nem érkezett. " +
      "Lehetséges timeout, TLS-, DNS- vagy alkalmazáshiba. " +
      `Részlet: ${detail}.`
    );
  }

  return (
    `A health ellenőrzés sikertelen: ${detail}. ` +
    "A pontos hibaok további naplóvizsgálatot igényel."
  );
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
