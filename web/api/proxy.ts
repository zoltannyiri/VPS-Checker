/// <reference types="node" />

const API_ORIGIN = "https://api.vpschecker.nyirizoltan.hu";

const jsonError = (message: string, status: number) =>
  Response.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") {
      return jsonError("Method not allowed", 405);
    }

    const apiKey = process.env.VPS_CHECKER_API_KEY;

    if (!apiKey) {
      return jsonError("Proxy not configured", 500);
    }

    const incoming = new URL(request.url);

    const route = incoming.searchParams.get("route");
    const id = incoming.searchParams.get("id");
    const period = incoming.searchParams.get("period");
    const monitorId = incoming.searchParams.get("monitorId");

    const validId = (value: string) =>
      /^[a-zA-Z0-9_-]{1,80}$/.test(value);

    if (period && !["24h", "7d", "30d"].includes(period)) {
      return jsonError("Invalid period", 400);
    }

    if (monitorId && !validId(monitorId)) {
      return jsonError("Invalid monitor ID", 400);
    }

    let path: string;

    switch (route) {
      case "monitors":
        path = "/api/monitors";
        break;

      case "overview":
        path = "/api/overview";
        break;

      case "incidents":
        path = "/api/incidents";
        break;

      case "history":
      case "stats":
        if (!id || !validId(id)) {
          return jsonError("Invalid monitor ID", 400);
        }
        path = `/api/monitors/${id}/${route}`;
        break;

      default:
        return jsonError("Unknown API route", 404);
    }

    const upstream = new URL(path, API_ORIGIN);

    if (period) upstream.searchParams.set("period", period);
    if (route === "incidents" && monitorId) {
      upstream.searchParams.set("monitorId", monitorId);
    }

    try {
      const response = await fetch(upstream, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "Accept": "application/json",
        },
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });

      const body = await response.text();

      return new Response(body, {
        status: response.status,
        headers: {
          "Content-Type":
            response.headers.get("content-type") ??
            "application/json",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return jsonError("Monitoring backend unavailable", 502);
    }
  },
};
