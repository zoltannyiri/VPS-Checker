
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function getSection(output: string, title: string): string | null {
  const marker = `=== ${title} ===`;
  const start = output.indexOf(marker);

  if (start === -1) return null;

  const rest = output.slice(start + marker.length);
  const end = rest.indexOf("\n===");

  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

function getNumber(output: string, key: string): number | null {
  const match = new RegExp(`^${key}=(\\d+)$`, "m").exec(output);
  return match ? Number(match[1]) : null;
}

function summarizeDiagnostics(output: string): string {
  if (
    !output.includes("VPS-Checker Diagnostics V2") ||
    !output.includes("=== Diagnostics completed ===")
  ) {
    return "Az SSH-vizsgálat kimenete hiányos vagy nem felismerhető.";
  }

  const lines: string[] = [
    "SSH-diagnosztika – TúrázzVelünk VPS",
    "Vizsgált időablak: az elmúlt 15 perc",
  ];

  const process = getSection(output, "PM2 process");

  if (process?.includes("PROCESS_NOT_RUNNING")) {
    lines.push("PM2: az elvárt Node.js folyamat nem fut.");
  } else if (process?.includes("PID_FILE_MISSING")) {
    lines.push("PM2: a PID-fájl hiányzik, a folyamatállapot nem igazolt.");
  } else if (process?.includes("INVALID_PID")) {
    lines.push("PM2: érvénytelen PID.");
  } else {
    const processLine = process
      ?.split("\n")
      .find((line) => /^\s*\d+\s+\S+\s+/.test(line));

    lines.push(
      processLine
        ? `PM2: a Node.js folyamat fut (PID ${processLine.trim().split(/\s+/)[0]}).`
        : "PM2: a folyamatállapot nem állapítható meg.",
    );
  }

  const nginx = getSection(output, "Nginx");
  lines.push(
    nginx === "active"
      ? "Nginx: aktív."
      : `Nginx: ${nginx || "állapota ismeretlen"}.`,
  );

  const oomSection = getSection(output, "Kernel OOM events");
  const oom = oomSection && /^\d+$/.test(oomSection)
    ? Number(oomSection)
    : null;

  if (oom === null) {
    lines.push("Kernel OOM: nincs megbízható mérési eredmény.");
  } else if (oom > 0) {
    lines.push(
      `Kernel OOM: ${oom} memóriahiányra utaló naplótalálat. További vizsgálat szükséges.`,
    );
  } else {
    lines.push("Kernel OOM: nincs találat az időablakban.");
  }

  const categories = [
    ["UPSTREAM_CONNECT_FAILED", "Upstream kapcsolódási hiba"],
    ["UPSTREAM_TIMEOUT", "Upstream időtúllépés"],
    ["NO_LIVE_UPSTREAMS", "Nincs elérhető upstream"],
    ["UPSTREAM_CLOSED", "Upstream kapcsolat megszakadt"],
    ["DISK_FULL", "Tárhelyhiányra utaló Nginx-hiba"],
  ] as const;

  const results = categories.map(([key, label]) => ({
    label,
    count: getNumber(output, key),
  }));

  const failures = results.filter(
    (result) => result.count !== null && result.count > 0,
  );

  if (failures.length > 0) {
    lines.push(
      "Nginx hibajelzések az időablakban (nem feltétlenül ehhez a szolgáltatáshoz):",
      ...failures.map(
        ({ label, count }) => `- ${label}: ${count} találat`,
      ),
    );
  } else if (results.every(({ count }) => count !== null)) {
    lines.push("Nginx: nincs találat a vizsgált hibakategóriákban.");
  } else {
    lines.push("Nginx: a hibastatisztika nem érhető el teljesen.");
  }

  const logAge = getNumber(output, "ERROR_LOG_AGE_SECONDS");

  if (logAge === null) {
    lines.push("PM2 hibanapló: nem elérhető.");
  } else if (logAge <= 900) {
    lines.push(
      "PM2 hibanapló: frissült az elmúlt 15 percben, a konkrét hiba még nem azonosított.",
    );
  } else {
    lines.push("PM2 hibanapló: nem frissült az elmúlt 15 percben.");
  }

  lines.push(
    "A fenti adatok diagnosztikai jelzések, nem bizonyítják önmagukban a leállás okát.",
  );

  return lines.join("\n");
}

export async function runSshDiagnostics(
  monitorId: string,
): Promise<string | null> {
  if (monitorId !== "turazzvelunk") return null;

  if (process.env.SSH_DIAGNOSTICS_ENABLED !== "true") {
    return null;
  }

  const host = process.env.TURAZZVELUNK_SSH_HOST;
  const keyPath = process.env.SSH_DIAGNOSTICS_KEY_PATH;

  if (!host || !keyPath) {
    return "SSH-diagnosztika: hiányzó konfiguráció.";
  }

  try {
    const { stdout } = await execFileAsync(
      "ssh",
      [
        "-i", keyPath,
        "-o", "IdentitiesOnly=yes",
        "-o", "StrictHostKeyChecking=yes",
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=5",
        `vpsmonitor@${host}`,
        "sudo -n /usr/local/sbin/vpschecker-diagnose-turazzvelunk",
      ],
      {
        timeout: 9_000,
        maxBuffer: 16 * 1024,
        encoding: "utf8",
      },
    );

    return summarizeDiagnostics(stdout);
  } catch (error) {
    console.error(
      "[SSH] Diagnosztikai hiba:",
      error instanceof Error ? error.message : "Ismeretlen hiba",
    );

    return "Az SSH-diagnosztika nem sikerült. A pontos hibaok nem állapítható meg.";
  }
}
