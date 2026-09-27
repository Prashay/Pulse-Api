import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(express.json({ limit: "12mb" }));
app.use(express.text({ limit: "12mb", type: ["text/*"] }));

// Download endpoint for desktop bundle (pulse.zip from root or dist_electron)
app.get(
  ["/pulse.zip", "/dist_electron/pulse.zip", "/api/download", "/api/download/pulse.zip"],
  (req, res) => {
    const rootPath = path.join(__dirname, "pulse.zip");
    const distPath = path.join(__dirname, "dist_electron", "pulse.zip");
    const target = fs.existsSync(rootPath) ? rootPath : fs.existsSync(distPath) ? distPath : null;

    if (target) {
      res.download(target, "pulse.zip", (err) => {
        if (err && !res.headersSent) {
          res.status(500).json({ ok: false, error: "Failed to download pulse.zip" });
        }
      });
    } else {
      res.status(404).json({ ok: false, error: "pulse.zip file not found on server" });
    }
  }
);


// Permissive CORS for local API testing across tools and ports
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, *");
  if (_req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "forge-proxy", timestamp: new Date().toISOString() });
});

// Built-in local mock endpoints for testing local collections & environments offline:
app.all("/api/mock/echo", (req, res) => {
  res.json({
    ok: true,
    method: req.method,
    headers: req.headers,
    query: req.query,
    body: req.body,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/mock/users", (_req, res) => {
  res.json({
    ok: true,
    users: [
      { id: 1, name: "Alice Jha", role: "admin", status: "active" },
      { id: 2, name: "Bob Smith", role: "developer", status: "active" },
      { id: 3, name: "Charlie Davis", role: "tester", status: "pending" },
    ],
  });
});

app.get("/api/mock/auth-check", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) {
    return res.status(401).json({ ok: false, error: "Missing Authorization header" });
  }
  res.json({ ok: true, authorized: true, authHeader: auth });
});

app.post("/api/proxy", async (req, res) => {
  const started = Date.now();
  let {
    method = "GET",
    url,
    headers = {},
    body,
    timeout = 30000,
  } = req.body ?? {};

  if (!url || typeof url !== "string") {
    res.status(400).json({
      ok: false,
      error: true,
      status: 0,
      statusText: "Bad Request",
      headers: {},
      body: "Missing request URL",
      time: Date.now() - started,
      size: 0,
    });
    return;
  }

  url = url.trim();
  // Auto-prefix http:// for local hosts if protocol is missing
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/.*)?$/i.test(url)) {
    url = `http://${url}`;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    res.json({
      ok: false,
      error: true,
      status: 0,
      statusText: "Invalid URL",
      headers: {},
      body: `Invalid URL: ${url}`,
      time: Date.now() - started,
      size: 0,
    });
    return;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    res.json({
      ok: false,
      error: true,
      status: 0,
      statusText: "Blocked",
      headers: {},
      body: "Only http and https URLs are allowed",
      time: Date.now() - started,
      size: 0,
    });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(timeout) || 30000);

  try {
    const outbound = new Headers();
    for (const [key, value] of Object.entries(headers)) {
      if (!key || value == null) continue;
      if (HOP_BY_HOP.has(key.toLowerCase())) continue;
      outbound.set(key, String(value));
    }

    const verb = String(method).toUpperCase();
    const init = {
      method: verb,
      headers: outbound,
      signal: controller.signal,
      redirect: "follow",
    };

    if (body != null && body !== "" && !["GET", "HEAD"].includes(verb)) {
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await fetch(url, init);
    const buffer = Buffer.from(await response.arrayBuffer());
    clearTimeout(timer);

    const respHeaders = {};
    response.headers.forEach((value, key) => {
      respHeaders[key] = value;
    });

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const isBinary =
      contentType.startsWith("image/") ||
      contentType.startsWith("audio/") ||
      contentType.startsWith("video/") ||
      contentType.includes("octet-stream") ||
      contentType.includes("application/pdf");

    const bodyText = isBinary
      ? `[binary ${contentType || "data"} — ${buffer.length} bytes]`
      : buffer.toString("utf8");

    res.json({
      ok: response.ok,
      error: false,
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
      body: bodyText,
      time: Date.now() - started,
      size: buffer.length,
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = err && err.name === "AbortError";
    const message = aborted
      ? `Request timed out after ${timeout}ms`
      : err instanceof Error
        ? err.message
        : String(err);

    res.json({
      ok: false,
      error: true,
      status: 0,
      statusText: aborted ? "Timeout" : "Network Error",
      headers: {},
      body: message,
      time: Date.now() - started,
      size: 0,
    });
  }
});

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`Pulse proxy listening on 127.0.0.1:${PORT}`);
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.log(`Pulse proxy port ${PORT} already in use, reusing active instance.`);
  } else {
    console.error("Proxy server error:", err);
  }
});
