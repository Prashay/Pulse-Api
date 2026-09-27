import type {
  AuthConfig,
  Collection,
  Environment,
  KeyValue,
  ProxyResponse,
  RequestSnapshot,
} from "./types";

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
    const hasExplicitTrue = collection.variables.some((v) => v.enabled === true);
    for (const v of collection.variables) {
      const isEnabled = hasExplicitTrue ? v.enabled !== false : true;
      if (isEnabled && v.key && v.key.trim()) {
        map.set(v.key.trim(), {
          key: v.key.trim(),
          value: v.value ?? "",
          source: "collection",
          sourceName: collection.name,
        });
      }
    }
  }

  // 2. Environment variables (highest priority, override collection variables)
  if (env && Array.isArray(env.variables)) {
    const hasExplicitTrue = env.variables.some((v) => v.enabled === true);
    for (const v of env.variables) {
      const isEnabled = hasExplicitTrue ? v.enabled !== false : true;
      if (isEnabled && v.key && v.key.trim()) {
        map.set(v.key.trim(), {
          key: v.key.trim(),
          value: v.value ?? "",
          source: "environment",
          sourceName: env.name,
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
  if (!text) return [];
  const matches = text.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.replace(/[{}]/g, "").trim())));
}

export function interpolate(
  text: string,
  env: Environment | null,
  collection?: Collection | null
): string {
  if (!text) return text;
  const map = buildVariableMap(env, collection);
  if (map.size === 0) return text;

  // Resolve recursively up to 5 passes for nested variables
  let result = text;
  for (let round = 0; round < 5; round++) {
    if (!result.includes("{{")) break;
    let changed = false;
    result = result.replace(/\{\{([^}]+)\}\}/g, (match, raw) => {
      const hit = lookupVariable(String(raw), env, collection);
      if (hit != null) {
        changed = true;
        return hit.value;
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
  return rows
    .filter((r) => r.enabled && r.key.trim())
    .map((r) => [
      interpolate(r.key.trim(), env, collection),
      interpolate(r.value, env, collection),
    ]);
}

export function applyAuth(
  auth: AuthConfig,
  env: Environment | null,
  headers: Record<string, string>,
  url: URL,
  collection?: Collection | null
): void {
  if (auth.type === "bearer" && auth.bearerToken) {
    headers.Authorization = `Bearer ${interpolate(auth.bearerToken, env, collection)}`;
  } else if (auth.type === "basic" && (auth.basicUser || auth.basicPass)) {
    const token = btoa(
      `${interpolate(auth.basicUser, env, collection)}:${interpolate(auth.basicPass, env, collection)}`
    );
    headers.Authorization = `Basic ${token}`;
  } else if (auth.type === "apikey" && auth.apiKeyName) {
    const name = interpolate(auth.apiKeyName, env, collection);
    const value = interpolate(auth.apiKeyValue, env, collection);
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
  if (!["GET", "HEAD"].includes(snap.method)) {
    if (snap.bodyMode === "json") {
      body = interpolate(snap.body, env, collection);
      if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
        headers["Content-Type"] = "application/json";
      }
    } else if (snap.bodyMode === "raw") {
      body = interpolate(snap.body, env, collection);
    } else if (snap.bodyMode === "form-urlencoded") {
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
    }
  }

  return { method: snap.method, url: url.toString(), headers, body };
}

export async function sendRequest(
  snap: RequestSnapshot,
  env: Environment | null,
  collection?: Collection | null
): Promise<ProxyResponse> {
  const outbound = buildOutbound(snap, env, collection);
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
    return {
      ok: false,
      error: true,
      status: res.status,
      statusText: res.statusText,
      headers: {},
      body: text || "Proxy request failed",
      time: 0,
      size: 0,
    };
  }
  return (await res.json()) as ProxyResponse;
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
