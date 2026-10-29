import express from "express";
import { timingSafeEqual } from "node:crypto";
import { getMonitorStatuses, hasMonitor, startMonitoring } from "./monitor.js";
import { HistoryPeriod } from "./models.js";
import { monitorStorage } from "./storage.js";
import "dotenv/config"

const app = express();
const PORT = Number(process.env.PORT ?? 5002);
const API_KEY = process.env["API_KEY"];

app.use(express.json());
app.use("/api", (req, res, next) => {
  if (!API_KEY) {
    next();
    return;
  }

  const authorization = req.header("authorization");
  const suppliedKey =
    req.header("x-api-key") ?? authorization?.replace(/^Bearer\s+/i, "");
  const expected = Buffer.from(API_KEY);
  const supplied = Buffer.from(suppliedKey ?? "");
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

app.get("/api/monitors", (_req, res) => {
  res.json(getMonitorStatuses());
});

app.get("/api/overview", (req, res) => {
  const period = readPeriod(req.query["period"], "24h");
  if (!period) {
    res.status(400).json({ error: "Invalid period. Use 24h, 7d or 30d." });
    return;
  }
  res.json(monitorStorage.getOverview(period));
});

app.get("/api/monitors/:id/history", (req, res) => {
  const monitorId = req.params["id"];
  const period = readPeriod(req.query["period"], "24h");
  if (!monitorId || !hasMonitor(monitorId)) {
    res.status(404).json({ error: "Monitor not found" });
    return;
  }
  if (!period) {
    res.status(400).json({ error: "Invalid period. Use 24h, 7d or 30d." });
    return;
  }
  res.json({
    monitorId,
    period,
    points: monitorStorage.getHistory(monitorId, period),
  });
});

app.get("/api/monitors/:id/stats", (req, res) => {
  const monitorId = req.params["id"];
  const period = readPeriod(req.query["period"], "24h");
  if (!monitorId || !hasMonitor(monitorId)) {
    res.status(404).json({ error: "Monitor not found" });
    return;
  }
  if (!period) {
    res.status(400).json({ error: "Invalid period. Use 24h, 7d or 30d." });
    return;
  }
  res.json(monitorStorage.getMonitorStats(monitorId, period));
});

app.get("/api/incidents", (req, res) => {
  const period = readPeriod(req.query["period"], "30d");
  const monitorId =
    typeof req.query["monitorId"] === "string"
      ? req.query["monitorId"]
      : undefined;
  if (!period) {
    res.status(400).json({ error: "Invalid period. Use 24h, 7d or 30d." });
    return;
  }
  if (monitorId && !hasMonitor(monitorId)) {
    res.status(404).json({ error: "Monitor not found" });
    return;
  }
  res.json(monitorStorage.getIncidents(period, monitorId));
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Unhandled API error", error);
    res.status(500).json({ error: "Internal server error" });
  },
);

function readPeriod(
  value: unknown,
  fallback: HistoryPeriod,
): HistoryPeriod | null {
  if (value === undefined) return fallback;
  return value === "24h" || value === "7d" || value === "30d" ? value : null;
}

app.listen(PORT, () => {
  console.log(`Server on port ${PORT}`);
  startMonitoring();
});
