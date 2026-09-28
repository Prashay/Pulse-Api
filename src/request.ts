import type {
  AuthConfig,
  Collection,
  Environment,
  KeyValue,
  ProxyResponse,
  RequestSnapshot,
} from "./types";
import { runScript } from "./scriptRunner";

export interface ResolvedVar {
  key: string;
  value: string;
  source: "environment" | "collection";
  sourceName: string;
}

export function buildVariableMap(
  env: Environment | null,
  collection?: Collection | null
): Map<string, ResolvedVar> {
  const map = new Map<string, ResolvedVar>();

  // 1. Collection variables (base layer)
  if (collection && Array.isArray(collection.variables)) {
    for (const v of collection.variables) {
      const isEnabled = v.enabled !== false;
      if (isEnabled && v.key && String(v.key).trim()) {
        const k = String(v.key).trim();
        map.set(k, {
          key: k,
          value: v.value != null ? String(v.value) : "",
          source: "collection",
          sourceName: collection.name || "Collection",
        });
      }
    }
  }

  // 2. Environment variables (highest priority, override collection variables)
  if (env && Array.isArray(env.variables)) {
    for (const v of env.variables) {
      const isEnabled = v.enabled !== false;
      if (isEnabled && v.key && String(v.key).trim()) {
        const k = String(v.key).trim();
        map.set(k, {
          key: k,
          value: v.value != null ? String(v.value) : "",
          source: "environment",
          sourceName: env.name || "Environment",
        });
      }
    }
  }

  return map;
}

export function lookupVariable(
  varName: string,
  env: Environment | null,
  collection?: Collection | null
): ResolvedVar | null {
  const map = buildVariableMap(env, collection);
  const clean = varName.trim();
  if (map.has(clean)) return map.get(clean)!;

  // Case-insensitive fallback
  const lower = clean.toLowerCase();
  for (const [k, v] of map.entries()) {
    if (k.toLowerCase() === lower) return v;
  }

  // Underscore vs hyphen vs camelCase fuzzy fallback
  const stripped = lower.replace(/[-_]/g, "");
  for (const [k, v] of map.entries()) {
    if (k.toLowerCase().replace(/[-_]/g, "") === stripped) return v;
  }

  return null;
}

export function extractVariables(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const matches = text.match(/\{\{\s*([^}]+?)\s*\}\}/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.replace(/[\{\}]/g, "").trim())));
}

export function interpolate(
  text: string,
  env: Environment | null,
  collection?: Collection | null
): string {
  if (!text || typeof text !== "string") return text || "";
  const map = buildVariableMap(env, collection);
  if (map.size === 0) return text;

  // Resolve recursively up to 5 passes for nested variables
  let result = text;
  for (let round = 0; round < 5; round++) {
    if (!result.includes("{{")) break;
    let changed = false;
    result = result.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, raw) => {
      const hit = lookupVariable(String(raw).trim(), env, collection);
      if (hit != null) {
        changed = true;
        return String(hit.value);
      }
      return match;
    });
    if (!changed) break;
  }

  return result;
}

function enabledPairs(
  rows: KeyValue[],
  env: Environment | null,
  collection?: Collection | null
): [string, string][] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r.enabled !== false && r.key && String(r.key).trim())
    .map((r) => [
      interpolate(String(r.key).trim(), env, collection),
      interpolate(r.value != null ? String(r.value) : "", env, collection),
    ]);
}

export function applyAuth(
  auth: AuthConfig,
  env: Environment | null,
  headers: Record<string, string>,
  url: URL,
  collection?: Collection | null
): void {
  if (!auth) return;

  if (auth.type === "bearer" && auth.bearerToken) {
    // Remove any existing authorization headers to avoid duplicates
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === "authorization") delete headers[k];
    }
    const token = interpolate(String(auth.bearerToken).trim(), env, collection);
    headers.Authorization = `Bearer ${token}`;
  } else if (auth.type === "basic" && (auth.basicUser || auth.basicPass)) {
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === "authorization") delete headers[k];
    }
    const u = interpolate(String(auth.basicUser ?? ""), env, collection);
    const p = interpolate(String(auth.basicPass ?? ""), env, collection);
    const raw = `${u}:${p}`;
    const token =
      typeof btoa !== "undefined"
        ? btoa(unescape(encodeURIComponent(raw)))
        : Buffer.from(raw).toString("base64");
    headers.Authorization = `Basic ${token}`;
  } else if (auth.type === "apikey" && auth.apiKeyName) {
    const name = interpolate(String(auth.apiKeyName).trim(), env, collection);
    const value = interpolate(auth.apiKeyValue != null ? String(auth.apiKeyValue) : "", env, collection);
    if (auth.apiKeyIn === "query") {
      url.searchParams.set(name, value);
    } else {
      headers[name] = value;
    }
  }
}

export function buildOutbound(
  snap: RequestSnapshot,
  env: Environment | null,
  collection?: Collection | null
): { method: string; url: string; headers: Record<string, string>; body: string | null } {
  let rawUrl = interpolate(snap.url.trim(), env, collection);
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/.*)?$/i.test(rawUrl)) {
    rawUrl = `http://${rawUrl}`;
  } else if (rawUrl.startsWith("//")) {
    rawUrl = `http:${rawUrl}`;
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl || "(empty)"}`);
  }

  for (const [key, value] of enabledPairs(snap.params, env, collection)) {
    url.searchParams.append(key, value);
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of enabledPairs(snap.headers, env, collection)) {
    headers[key] = value;
  }

  applyAuth(snap.auth, env, headers, url, collection);

  let body: string | null = null;
  if (snap.body && snap.bodyMode !== "none") {
    if (snap.bodyMode === "form-urlencoded") {
      const params = new URLSearchParams();
      for (const line of snap.body.split("\n")) {
        const idx = line.indexOf("=");
        if (idx === -1) continue;
        const k = interpolate(line.slice(0, idx).trim(), env, collection);
        const v = interpolate(line.slice(idx + 1).trim(), env, collection);
        if (k) params.append(k, v);
      }
      body = params.toString();
      if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
      }
    } else {
      body = interpolate(snap.body, env, collection);
      if (snap.bodyMode === "json" && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
        headers["Content-Type"] = "application/json";
      }
    }
  }

  return { method: snap.method, url: url.toString(), headers, body };
}

export async function sendRequest(
  snap: RequestSnapshot,
  env: Environment | null,
  collection?: Collection | null,
  onEnvUpdate?: (updatedVariables: KeyValue[]) => void
): Promise<ProxyResponse> {
  let effectiveSnap = { ...snap };
  const allScriptLogs: string[] = [];

  // 1. Run Pre-request Script (if configured)
  if (snap.preScript && snap.preScript.trim()) {
    try {
      const preResult = await runScript("pre", snap.preScript, env, effectiveSnap, null);
      if (preResult.envModified && onEnvUpdate) {
        onEnvUpdate(preResult.updatedEnvVariables);
      }
      if (preResult.mutatedRequest) {
        effectiveSnap = { ...effectiveSnap, ...preResult.mutatedRequest };
      }
      for (const log of preResult.consoleLogs) {
        allScriptLogs.push(`[Pre-request] ${log.message}`);
      }
    } catch (err) {
      allScriptLogs.push(`[Pre-request Error] ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Build Outbound Request with interpolated variables
  const outbound = buildOutbound(effectiveSnap, env, collection);

  // 3. Dispatch to API Proxy
  let responseData: ProxyResponse;
  try {
    const res = await fetch("/api/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: outbound.method,
        url: outbound.url,
        headers: outbound.headers,
        body: outbound.body,
        timeout: 30000,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      responseData = {
        ok: false,
        error: true,
        status: res.status,
        statusText: res.statusText,
        headers: {},
        body: text || "Proxy request failed",
        time: 0,
        size: 0,
      };
    } else {
      responseData = (await res.json()) as ProxyResponse;
    }
  } catch (err) {
    responseData = {
      ok: false,
      error: true,
      status: 0,
      statusText: "Network Error",
      headers: {},
      body: err instanceof Error ? err.message : String(err),
      time: 0,
      size: 0,
    };
  }

  // 4. Run Post-response (Tests) Script (if configured)
  if (snap.postScript && snap.postScript.trim()) {
    try {
      const postResult = await runScript("post", snap.postScript, env, effectiveSnap, responseData);
      if (postResult.envModified && onEnvUpdate) {
        onEnvUpdate(postResult.updatedEnvVariables);
      }
      responseData.testResults = postResult.testResults;
      for (const log of postResult.consoleLogs) {
        allScriptLogs.push(`[Tests] ${log.message}`);
      }
    } catch (err) {
      allScriptLogs.push(`[Tests Error] ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (allScriptLogs.length > 0) {
    responseData.scriptLogs = allScriptLogs;
  }

  return responseData;
}

export function prettyBody(raw: string, contentType = ""): string {
  const ct = contentType.toLowerCase();
  if (!raw) return "";
  if (ct.includes("json") || looksLikeJson(raw)) {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
  return raw;
}

function looksLikeJson(raw: string): boolean {
  const t = raw.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function collectRequests(
  nodes: import("./types").TreeNode[]
): import("./types").RequestItem[] {
  const out: import("./types").RequestItem[] = [];
  const walk = (list: import("./types").TreeNode[]) => {
    for (const node of list) {
      if (node.type === "request") out.push(node);
      else walk(node.children);
    }
  };
  walk(nodes);
  return out;
}
