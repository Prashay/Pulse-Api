import { app, BrowserWindow, shell, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Resolve __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Disable TLS rejection for local testing, self-signed certs & microservice testing
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Detect app name from package.json
let appTitle = "Pulse API Studio";
try {
  const pkgPath = path.join(__dirname, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    if (pkg.productName) {
      appTitle = pkg.productName;
    } else if (pkg.name) {
      appTitle = pkg.name
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }
} catch {
  // Use fallback title
}

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

// IPC Handler for Health Check
ipcMain.handle("pulse:health-check", async () => {
  return {
    ok: true,
    service: "pulse-desktop-native",
    platform: process.platform,
    timestamp: new Date().toISOString(),
  };
});

// IPC Handler for Native Request Execution (Bypasses CORS, local ports & firewall blocks)
ipcMain.handle("pulse:proxy-request", async (_event, reqData) => {
  const started = Date.now();
  let {
    method = "GET",
    url,
    headers = {},
    body,
    timeout = 0,
  } = reqData ?? {};

  if (!url || typeof url !== "string") {
    return {
      ok: false,
      error: true,
      status: 0,
      statusText: "Bad Request",
      headers: {},
      body: "Missing request URL",
      time: Date.now() - started,
      size: 0,
    };
  }

  let targetUrl = url.trim();
  // Auto-prefix relative mock endpoints or bare local hostnames
  if (targetUrl.startsWith("/")) {
    targetUrl = `http://127.0.0.1:3001${targetUrl}`;
  } else if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/.*)?$/i.test(targetUrl)) {
    targetUrl = `http://${targetUrl}`;
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return {
      ok: false,
      error: true,
      status: 0,
      statusText: "Invalid URL",
      headers: {},
      body: `Invalid URL: ${targetUrl}`,
      time: Date.now() - started,
      size: 0,
    };
  }

  // Handle local mock endpoints in-memory so sample requests work immediately offline
  const pathname = parsed.pathname;
  if (pathname === "/api/health") {
    const data = JSON.stringify(
      { ok: true, service: "pulse-desktop-native", platform: process.platform, timestamp: new Date().toISOString() },
      null,
      2
    );
    return {
      ok: true,
      error: false,
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      body: data,
      time: Date.now() - started,
      size: Buffer.byteLength(data),
    };
  }

  if (pathname === "/api/mock/echo") {
    let parsedBody = body;
    if (typeof body === "string") {
      try {
        parsedBody = JSON.parse(body);
      } catch {
        parsedBody = body;
      }
    }
    const data = JSON.stringify(
      {
        ok: true,
        method: String(method || "GET").toUpperCase(),
        headers,
        query: Object.fromEntries(parsed.searchParams.entries()),
        body: parsedBody,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    );
    return {
      ok: true,
      error: false,
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      body: data,
      time: Date.now() - started,
      size: Buffer.byteLength(data),
    };
  }

  if (pathname === "/api/mock/users") {
    const data = JSON.stringify(
      {
        ok: true,
        users: [
          { id: 1, name: "Alice Jha", role: "admin", status: "active" },
          { id: 2, name: "Bob Smith", role: "developer", status: "active" },
          { id: 3, name: "Charlie Davis", role: "tester", status: "pending" },
        ],
      },
      null,
      2
    );
    return {
      ok: true,
      error: false,
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      body: data,
      time: Date.now() - started,
      size: Buffer.byteLength(data),
    };
  }

  if (pathname === "/api/mock/auth-check") {
    let authHeader = "";
    if (headers && typeof headers === "object") {
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === "authorization") {
          authHeader = String(v);
          break;
        }
      }
    }
    if (!authHeader) {
      const data = JSON.stringify({ ok: false, error: "Missing Authorization header" }, null, 2);
      return {
        ok: false,
        error: true,
        status: 401,
        statusText: "Unauthorized",
        headers: { "content-type": "application/json" },
        body: data,
        time: Date.now() - started,
        size: Buffer.byteLength(data),
      };
    }
    const data = JSON.stringify({ ok: true, authorized: true, authHeader }, null, 2);
    return {
      ok: true,
      error: false,
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      body: data,
      time: Date.now() - started,
      size: Buffer.byteLength(data),
    };
  }

  // Outbound HTTP/HTTPS request execution
  const controller = new AbortController();
  const parsedTimeout = Math.max(0, Number(timeout) || 0);
  const timer = parsedTimeout > 0 ? setTimeout(() => controller.abort(), parsedTimeout) : null;

  try {
    const outboundHeaders = new Headers();
    if (headers && typeof headers === "object") {
      for (const [key, value] of Object.entries(headers)) {
        if (!key || value == null) continue;
        if (HOP_BY_HOP.has(key.toLowerCase())) continue;
        try {
          outboundHeaders.set(key, String(value));
        } catch {
          // Skip invalid header format
        }
      }
    }

    const verb = String(method || "GET").toUpperCase();
    const init = {
      method: verb,
      headers: outboundHeaders,
      signal: controller.signal,
      redirect: "follow",
    };

    if (body != null && body !== "" && !["GET", "HEAD"].includes(verb)) {
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(targetUrl, init);
    } catch (fetchErr) {
      // If localhost failed with ECONNREFUSED (due to Node IPv6 ::1 default), retry with IPv4 127.0.0.1
      if (
        targetUrl.includes("localhost") &&
        (fetchErr?.message?.includes("ECONNREFUSED") || fetchErr?.cause?.code === "ECONNREFUSED")
      ) {
        const ipv4Url = targetUrl.replace("://localhost", "://127.0.0.1");
        response = await fetch(ipv4Url, init);
      } else {
        throw fetchErr;
      }
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (timer) clearTimeout(timer);

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

    return {
      ok: response.ok,
      error: false,
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
      body: bodyText,
      time: Date.now() - started,
      size: buffer.length,
    };
  } catch (err) {
    if (timer) clearTimeout(timer);
    const aborted = err && err.name === "AbortError";
    const message = aborted
      ? `Request timed out after ${parsedTimeout}ms`
      : err instanceof Error
      ? err.message
      : String(err);

    return {
      ok: false,
      error: true,
      status: 0,
      statusText: aborted ? "Timeout" : "Network Error",
      headers: {},
      body: message,
      time: Date.now() - started,
      size: 0,
    };
  }
});

// Optionally start local Express server for local tooling / port 3001 compatibility
try {
  await import("./server.js");
} catch (err) {
  console.log("Local Express server notification:", err?.message || err);
}

let mainWindow = null;

function createWindow() {
  const iconPath = path.join(__dirname, "public", "icon.png");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: appTitle,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: "#090d16",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  // Preserve app title
  mainWindow.on("page-title-updated", (e) => {
    e.preventDefault();
  });

  // Open external links in user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  const distIndex = path.join(__dirname, "dist", "index.html");
  if (process.env.ELECTRON_START_URL) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else if (fs.existsSync(distIndex)) {
    mainWindow.loadFile(distIndex);
  } else {
    mainWindow.loadURL("http://localhost:5173");
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
