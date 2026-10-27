import assert from "node:assert/strict";
import test from "node:test";
import { MonitorState } from "./models.js";
import { MonitorStorage } from "./storage.js";

test("stores real checks and calculates observed uptime", () => {
  const storage = new MonitorStorage(":memory:");
  const state: MonitorState = {
    id: "test",
    name: "Test",
    host: "192.0.2.1",
    port: 443,
    status: "UP",
    ping: true,
    pingLatencyMs: 10,
    tcp: true,
    tcpConnectTimeMs: 5,
    api: { online: true, httpStatus: 200, responseTimeMs: 20, error: null },
    consecutiveFailures: 0,
    lastCheckedAt: new Date(Date.now() - 1_000).toISOString(),
    lastSuccessfulAt: new Date(Date.now() - 1_000).toISOString(),
    recentChecks: [],
  };
  storage.recordCheck(state);
  storage.recordCheck({
    ...state,
    status: "DEGRADED",
    api: {
      online: false,
      httpStatus: 503,
      responseTimeMs: 30,
      error: "HTTP 503",
    },
    consecutiveFailures: 1,
    lastCheckedAt: new Date().toISOString(),
  });

  const stats = storage.getMonitorStats("test", "24h");
  assert.equal(stats.sampleCount, 2);
  assert.equal(stats.uptimePercentage, 50);
  assert.equal(storage.getHistory("test", "24h").length, 2);

  storage.openIncident("test", new Date().toISOString(), "HTTP 503");
  assert.equal(storage.getIncidents("24h", "test").length, 1);
  storage.closeIncident("test", new Date().toISOString());
  assert.ok(storage.getIncidents("24h", "test")[0]?.endedAt);
});
