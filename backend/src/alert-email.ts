
import { sendMail } from "./mailer.js";
import type { MonitorConfig, MonitorState } from "./models.js";

export interface MonitorAlert {
  kind: "DOWN" | "RECOVERED";
  monitor: MonitorConfig;
  state: MonitorState;
  detectedAt: string;
  startedAt: string | null;
  error: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Nem ismert";

  return new Intl.DateTimeFormat("hu-HU", {
    timeZone: "Europe/Budapest",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(iso));
}

function formatDuration(
  startedAt: string | null,
  endedAt: string,
): string {
  if (!startedAt) return "Nem ismert";

  const elapsed = Date.parse(endedAt) - Date.parse(startedAt);

  if (!Number.isFinite(elapsed) || elapsed < 0) {
    return "Nem ismert";
  }

  const minutes = Math.floor(elapsed / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;

  const parts = [
    days > 0 ? `${days} nap` : "",
    hours > 0 ? `${hours} óra` : "",
    remainingMinutes > 0 ? `${remainingMinutes} perc` : "",
  ].filter(Boolean);

  return parts.join(" ") || "Kevesebb mint 1 perc";
}

function formatStatus(value: boolean | null): string {
  if (value === null) return "Nincs adat";
  return value ? "Elérhető" : "Nem elérhető";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[char] ?? char;
  });
}

export async function sendMonitorAlert({
  kind,
  monitor,
  state,
  detectedAt,
  startedAt,
  error,
}: MonitorAlert): Promise<void> {
  const recipient = process.env.ALERT_EMAIL_TO;

  if (!recipient) {
    console.warn("[EMAIL] ALERT_EMAIL_TO nincs beállítva.");
    return;
  }

  const excluded = (process.env.ALERT_EXCLUDED_MONITORS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (excluded.includes(monitor.id)) {
    console.log(`[EMAIL] ${monitor.name}: értesítés kihagyva.`);
    return;
  }

  const isDown = kind === "DOWN";

  const accent = isDown ? "#dc2626" : "#16a34a";
  const background = isDown ? "#fef2f2" : "#f0fdf4";
  const label = isDown ? "DOWN" : "RECOVERED";

  const heading = isDown
    ? "Szolgáltatás nem elérhető"
    : "Szolgáltatás helyreállt";

  const subject = isDown
    ? `🚨 VPS-Checker | ${monitor.name} leállt`
    : `✅ VPS-Checker | ${monitor.name} helyreállt`;

  const rows: Array<[string, string]> = [
    ["Szolgáltatás", monitor.name],
    ["Host / IP", monitor.host],
    ["TCP-port", String(monitor.port)],
    ["Health URL", monitor.healthUrl],
    ["Ping", formatStatus(state.ping)],
    ["TCP", formatStatus(state.tcp)],
    ["API", formatStatus(state.api.online)],
    [
      "HTTP-státusz",
      state.api.httpStatus === null
        ? "Nincs válasz"
        : String(state.api.httpStatus),
    ],
  ];

  if (isDown) {
    rows.push(
      ["Hiba oka", error || "Ismeretlen hiba"],
      ["Leállás észlelve", formatDate(detectedAt)],
    );
  } else {
    rows.push(
      ["Leállás észlelve", formatDate(startedAt)],
      ["Helyreállás észlelve", formatDate(detectedAt)],
      ["Megfigyelt kiesés", formatDuration(startedAt, detectedAt)],
      ["Korábbi hiba", error || "Nem ismert"],
    );
  }

  const htmlRows = rows
    .map(
      ([name, value]) => `
        <tr>
          <td style="
            padding:12px;
            border-bottom:1px solid #e5e7eb;
            color:#64748b;
            vertical-align:top;
            width:40%;
          ">${escapeHtml(name)}</td>
          <td style="
            padding:12px;
            border-bottom:1px solid #e5e7eb;
            color:#0f172a;
            font-weight:600;
            overflow-wrap:anywhere;
          ">${escapeHtml(value)}</td>
        </tr>
      `,
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html lang="hu">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(subject)}</title>
      </head>
      <body style="
        margin:0;
        padding:32px 12px;
        background:#f1f5f9;
        font-family:Arial,Helvetica,sans-serif;
      ">
        <table role="presentation"
          cellpadding="0" cellspacing="0"
          style="
            width:100%;
            max-width:620px;
            margin:0 auto;
            background:#ffffff;
            border-radius:14px;
            border-collapse:separate;
            overflow:hidden;
          ">
          <tr>
            <td style="
              padding:24px;
              background:#0f172a;
              color:#ffffff;
              font-size:20px;
              font-weight:700;
            ">
              VPS-CHECKER
            </td>
          </tr>

          <tr>
            <td style="padding:28px 24px 12px;">
              <span style="
                display:inline-block;
                padding:7px 12px;
                background:${background};
                color:${accent};
                border-radius:6px;
                font-weight:700;
                font-size:12px;
              ">${label}</span>

              <h1 style="
                margin:18px 0 8px;
                font-size:24px;
                line-height:1.3;
                color:#0f172a;
              ">${escapeHtml(heading)}</h1>

              <p style="
                margin:0 0 18px;
                color:#64748b;
                font-size:15px;
              ">${escapeHtml(monitor.name)}</p>

              <table role="presentation"
                cellpadding="0" cellspacing="0"
                style="
                  width:100%;
                  border-collapse:collapse;
                  font-size:14px;
                ">
                ${htmlRows}
              </table>
            </td>
          </tr>

          <tr>
            <td style="
              padding:22px 24px;
              color:#94a3b8;
              font-size:12px;
              text-align:center;
            ">
              VPS-Checker – Automatikus monitoring értesítés
              <p style="margin:6px 0 0;">
                Időzóna: Europe/Budapest
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const text = [
    heading,
    "",
    ...rows.map(([name, value]) => `${name}: ${value}`),
    "",
    "VPS-Checker automatikus értesítés.",
  ].join("\n");

  try {
    await sendMail({
      to: recipient,
      subject,
      html,
      text,
    });

    console.log(`[EMAIL] ${kind} értesítés elküldve: ${monitor.name}`);
  } catch (err) {
    console.error(`[EMAIL] Sikertelen küldés: ${monitor.name}`, err);
  }
}
