import type {
  AuthConfig,
  Collection,
  Environment,
  FolderItem,
  KeyValue,
  ProxyResponse,
  RequestSnapshot,
  TestResult,
} from "./types";
import { runScript } from "./scriptRunner";
import { findParentFolders } from "./tree";

export interface ResolvedVar {
  key: string;
  value: string;
  source: "environment" | "collection" | "dynamic" | "variable";
  sourceName: string;
}

export function generateRandomGuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isDynamicVariable(varName: string): boolean {
  const clean = varName.trim().toLowerCase();
  return (
    clean === "$guid" ||
    clean === "$randomuuid" ||
    clean === "$timestamp" ||
    clean === "$isotimestamp" ||
    clean === "$randomint" ||
    clean === "$randomalphanumeric" ||
    clean === "$randomemail" ||
    clean === "$randomboolean"
  );
}

export function resolveDynamicVariable(varName: string): string | null {
  const clean = varName.trim().toLowerCase();
  switch (clean) {
    case "$guid":
    case "$randomuuid":
      return generateRandomGuid();
    case "$timestamp":
      return Math.floor(Date.now() / 1000).toString();
    case "$isotimestamp":
      return new Date().toISOString();
    case "$randomint":
      return Math.floor(Math.random() * 1000).toString();
    case "$randomalphanumeric":
      return Math.random().toString(36).substring(2, 10);
    case "$randomemail":
      return `user_${Math.random().toString(36).substring(2, 7)}@example.com`;
    case "$randomboolean":
      return Math.random() >= 0.5 ? "true" : "false";
    default:
      return null;
  }
}

export function getDynamicVariableDescription(varName: string): string {
  const clean = varName.trim().toLowerCase();
  switch (clean) {
    case "$guid":
    case "$randomuuid":
      return "random UUID v4";
    case "$timestamp":
      return "Unix timestamp (s)";
    case "$isotimestamp":
      return "ISO 8601 timestamp";
    case "$randomint":
      return "random integer (0-1000)";
    case "$randomalphanumeric":
      return "random alphanumeric";
    case "$randomemail":
      return "random email address";
    case "$randomboolean":
      return "random boolean (true/false)";
    default:
      return "dynamic variable";
  }
}

export function buildVariableMap(
  env: Environment | null,
  collection?: Collection | null,
  executionVars?: Record<string, string> | Map<string, string> | null
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

  // 2. Environment variables (higher priority, override collection variables)
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

  // 3. Execution / Local variables (highest priority, override env & collection variables)
  if (executionVars) {
    const entries =
      executionVars instanceof Map
        ? executionVars.entries()
        : Object.entries(executionVars);
    for (const [k, val] of entries) {
      if (k && String(k).trim()) {
        const trimmedKey = String(k).trim();
        map.set(trimmedKey, {
          key: trimmedKey,
          value: val != null ? String(val) : "",
          source: "variable",
          sourceName: "Execution Variable",
        });
      }
    }
  }

  return map;
}

export function lookupVariable(
  varName: string,
  env: Environment | null,
  collection?: Collection | null,
  executionVars?: Record<string, string> | Map<string, string> | null
): ResolvedVar | null {
  const clean = varName.trim();

  // Dynamic Postman variables (e.g. {{$guid}}, {{$timestamp}})
  if (isDynamicVariable(clean)) {
    return {
      key: clean,
      value: getDynamicVariableDescription(clean),
      source: "dynamic",
      sourceName: "Postman Dynamic Variable",
    };
  }

  const map = buildVariableMap(env, collection, executionVars);
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
  collection?: Collection | null,
  executionVars?: Record<string, string> | Map<string, string> | null
): string {
  if (!text || typeof text !== "string") return text || "";
  if (!text.includes("{{")) return text;

  // Resolve recursively up to 5 passes for nested variables
  let result = text;
  for (let round = 0; round < 5; round++) {
    if (!result.includes("{{")) break;
    let changed = false;
    result = result.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, raw) => {
      const varName = String(raw).trim();
      // 1. Dynamic variables (e.g. $guid generates a random GUID each time)
      const dynamicVal = resolveDynamicVariable(varName);
      if (dynamicVal !== null) {
        changed = true;
        return dynamicVal;
      }
      // 2. Execution, environment, and collection variables
      const hit = lookupVariable(varName, env, collection, executionVars);
      if (hit != null && hit.source !== "dynamic") {
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
  collection?: Collection | null,
  executionVars?: Record<string, string> | Map<string, string> | null
): [string, string][] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r.enabled !== false && r.key && String(r.key).trim())
    .map((r) => [
      interpolate(String(r.key).trim(), env, collection, executionVars),
      interpolate(r.value != null ? String(r.value) : "", env, collection, executionVars),
    ]);
}

export function applyAuth(
  auth: AuthConfig,
  env: Environment | null,
  headers: Record<string, string>,
  url: URL,
  collection?: Collection | null,
  executionVars?: Record<string, string> | Map<string, string> | null
): void {
  if (!auth) return;

  if (auth.type === "bearer" && auth.bearerToken) {
    // Remove any existing authorization headers to avoid duplicates
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === "authorization") delete headers[k];
    }
    const token = interpolate(String(auth.bearerToken).trim(), env, collection, executionVars);
    headers.Authorization = `Bearer ${token}`;
  } else if (auth.type === "basic" && (auth.basicUser || auth.basicPass)) {
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === "authorization") delete headers[k];
    }
    const u = interpolate(String(auth.basicUser ?? ""), env, collection, executionVars);
    const p = interpolate(String(auth.basicPass ?? ""), env, collection, executionVars);
    const raw = `${u}:${p}`;
    const token =
      typeof btoa !== "undefined"
        ? btoa(unescape(encodeURIComponent(raw)))
        : Buffer.from(raw).toString("base64");
    headers.Authorization = `Basic ${token}`;
  } else if (auth.type === "apikey" && auth.apiKeyName) {
    const name = interpolate(String(auth.apiKeyName).trim(), env, collection, executionVars);
    const value = interpolate(auth.apiKeyValue != null ? String(auth.apiKeyValue) : "", env, collection, executionVars);
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
  collection?: Collection | null,
  executionVars?: Record<string, string> | Map<string, string> | null
): { method: string; url: string; headers: Record<string, string>; body: string | null } {
  let rawUrl = interpolate(snap.url.trim(), env, collection, executionVars);
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

  for (const [key, value] of enabledPairs(snap.params, env, collection, executionVars)) {
    url.searchParams.append(key, value);
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of enabledPairs(snap.headers, env, collection, executionVars)) {
    headers[key] = value;
  }

  applyAuth(snap.auth, env, headers, url, collection, executionVars);

  let body: string | null = null;
  if (snap.body && snap.bodyMode !== "none") {
    if (snap.bodyMode === "form-urlencoded") {
      const params = new URLSearchParams();
      for (const line of snap.body.split("\n")) {
        const idx = line.indexOf("=");
        if (idx === -1) continue;
        const k = interpolate(line.slice(0, idx).trim(), env, collection, executionVars);
        const v = interpolate(line.slice(idx + 1).trim(), env, collection, executionVars);
        if (k) params.append(k, v);
      }
      body = params.toString();
      if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
      }
    } else {
      body = interpolate(snap.body, env, collection, executionVars);
      if (snap.bodyMode === "json" && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
        headers["Content-Type"] = "application/json";
      }
    }
  }

  return { method: snap.method, url: url.toString(), headers, body };
}

export function getProxyBaseUrl(): string {
  if (typeof window !== "undefined") {
    if (window.location.protocol === "file:" || !window.location.host) {
      return "http://127.0.0.1:3001";
    }
  }
  return "";
}

export interface SendRequestOptions {
  requestId?: string | null;
  parentFolders?: FolderItem[];
  onCollectionUpdate?: (updatedVariables: KeyValue[]) => void;
  timeout?: number;
}

export function resolveRequestTimeout(
  options?: SendRequestOptions,
  env?: Environment | null,
  collection?: Collection | null,
  executionVars?: Record<string, string> | Map<string, string> | null
): number {
  // 1. Explicit options passed
  if (options?.timeout !== undefined && options.timeout !== null) {
    const val = Number(options.timeout);
    if (!isNaN(val)) return Math.max(0, val);
  }

  // 2. Variable override in executionVars / env / collection (e.g. {{timeout}})
  const safeEnv = env || null;
  const safeCol = collection || null;
  const varHit =
    lookupVariable("timeout", safeEnv, safeCol, executionVars) ||
    lookupVariable("request_timeout", safeEnv, safeCol, executionVars) ||
    lookupVariable("requestTimeout", safeEnv, safeCol, executionVars);

  if (varHit && varHit.value !== undefined && varHit.value !== null && varHit.value !== "") {
    const val = Number(varHit.value);
    if (!isNaN(val)) return Math.max(0, val);
  }

  // 3. User setting in localStorage ("pulse_request_timeout")
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("pulse_request_timeout");
      if (stored !== null && stored !== "") {
        const val = Number(stored);
        if (!isNaN(val)) return Math.max(0, val);
      }
    } catch {}
  }

  // 4. Default: 0 (unlimited timeout / never abort). Prevents unwanted 30000ms aborts.
  return 0;
}

export async function sendRequest(
  snap: RequestSnapshot,
  env: Environment | null,
  collection?: Collection | null,
  onEnvUpdate?: (updatedVariables: KeyValue[]) => void,
  options?: SendRequestOptions
): Promise<ProxyResponse> {
  let effectiveSnap = { ...snap };
  let effectiveEnv: Environment = env
    ? { ...env, variables: [...(env.variables || [])] }
    : { id: "in-memory-env", name: "In-Memory Env", variables: [] };
  let effectiveCollection: Collection | null = collection
    ? { ...collection, variables: [...(collection.variables || [])] }
    : null;
  const executionVars = new Map<string, string>();
  const allScriptLogs: string[] = [];

  // Determine parent folder hierarchy if applicable
  let parentFolders: FolderItem[] = options?.parentFolders || [];
  if (parentFolders.length === 0 && options?.requestId && collection?.children) {
    const found = findParentFolders(collection.children, options.requestId);
    if (found) parentFolders = found;
  }

  // 1. Run Pre-request Scripts in Postman order:
  //    Collection Pre-request -> Folder(s) Pre-request (outer to inner) -> Request Pre-request
  const preScripts: { source: string; code: string }[] = [];
  if (effectiveCollection?.preScript && effectiveCollection.preScript.trim()) {
    preScripts.push({
      source: `Collection "${effectiveCollection.name}"`,
      code: effectiveCollection.preScript,
    });
  }
  for (const folder of parentFolders) {
    if (folder.preScript && folder.preScript.trim()) {
      preScripts.push({
        source: `Folder "${folder.name}"`,
        code: folder.preScript,
      });
    }
  }
  if (effectiveSnap.preScript && effectiveSnap.preScript.trim()) {
    preScripts.push({
      source: `Request "${effectiveSnap.name || "Draft"}"`,
      code: effectiveSnap.preScript,
    });
  }

  for (const item of preScripts) {
    try {
      const preResult = await runScript(
        "pre",
        item.code,
        effectiveEnv,
        effectiveSnap,
        null,
        effectiveCollection,
        executionVars
      );

      // Immediately propagate updated environment variables
      if (preResult.envModified) {
        effectiveEnv = { ...effectiveEnv, variables: preResult.updatedEnvVariables };
        if (onEnvUpdate) {
          onEnvUpdate(preResult.updatedEnvVariables);
        }
      }

      // Immediately propagate updated collection variables
      if (preResult.collectionModified && effectiveCollection) {
        effectiveCollection = {
          ...effectiveCollection,
          variables: preResult.updatedCollectionVariables,
        };
        if (options?.onCollectionUpdate) {
          options.onCollectionUpdate(preResult.updatedCollectionVariables);
        }
      }

      // Propagate transient execution variables
      if (preResult.executionVariables) {
        for (const [k, v] of Object.entries(preResult.executionVariables)) {
          executionVars.set(k, v);
        }
      }

      // Propagate mutated request snapshot
      if (preResult.mutatedRequest) {
        effectiveSnap = { ...effectiveSnap, ...preResult.mutatedRequest };
      }

      for (const log of preResult.consoleLogs) {
        allScriptLogs.push(`[Pre-request (${item.source})] ${log.message}`);
      }
    } catch (err) {
      allScriptLogs.push(
        `[Pre-request Error (${item.source})] ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 2. Build Outbound Request with interpolated variables (including newly set collection/env/execution vars)
  const outbound = buildOutbound(effectiveSnap, effectiveEnv, effectiveCollection, executionVars);
  const requestTimeout = resolveRequestTimeout(options, effectiveEnv, effectiveCollection, executionVars);

  // 3. Dispatch Request: Native Desktop IPC (if available) -> Local Proxy -> Direct Fetch fallback
  let responseData: ProxyResponse | null = null;

  // Layer 1: Electron Desktop Native IPC (Zero CORS issues, zero port conflicts, offline mock support)
  if (typeof window !== "undefined" && window.pulseDesktop?.proxyRequest) {
    try {
      responseData = await window.pulseDesktop.proxyRequest({
        method: outbound.method,
        url: outbound.url,
        headers: outbound.headers,
        body: outbound.body,
        timeout: requestTimeout,
      });
    } catch (ipcErr) {
      console.warn("Desktop native IPC proxy encountered error, trying HTTP proxy:", ipcErr);
      responseData = null;
    }
  }

  // Layer 2: HTTP Proxy Server (/api/proxy or http://127.0.0.1:3001/api/proxy)
  if (!responseData) {
    const proxyUrl = `${getProxyBaseUrl()}/api/proxy`;
    try {
      const res = await fetch(proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: outbound.method,
          url: outbound.url,
          headers: outbound.headers,
          body: outbound.body,
          timeout: requestTimeout,
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
    } catch (proxyErr) {
      // Layer 3: Direct Client-Side Fetch (fallback if proxy is unreachable)
      let directTimer: any = null;
      try {
        const started = Date.now();
        const directHeaders = new Headers();
        for (const [k, v] of Object.entries(outbound.headers)) {
          try {
            directHeaders.set(k, v);
          } catch {}
        }
        const directController = new AbortController();
        directTimer = requestTimeout > 0
          ? setTimeout(() => directController.abort(), requestTimeout)
          : null;

        const directInit: RequestInit = {
          method: outbound.method,
          headers: directHeaders,
          signal: directController.signal,
        };
        if (outbound.body && !["GET", "HEAD"].includes(outbound.method.toUpperCase())) {
          directInit.body = outbound.body;
        }
        const directRes = await fetch(outbound.url, directInit);
        if (directTimer) clearTimeout(directTimer);
        const text = await directRes.text();
        const respHeaders: Record<string, string> = {};
        directRes.headers.forEach((v, k) => {
          respHeaders[k] = v;
        });
        responseData = {
          ok: directRes.ok,
          error: !directRes.ok,
          status: directRes.status,
          statusText: directRes.statusText,
          headers: respHeaders,
          body: text,
          time: Date.now() - started,
          size: new Blob([text]).size,
        };
      } catch (directErr) {
        if (directTimer) clearTimeout(directTimer);
        const isAbort = (directErr as any)?.name === "AbortError";
        const errMsg = proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
        responseData = {
          ok: false,
          error: true,
          status: 0,
          statusText: isAbort ? "Timeout" : "Proxy Error",
          headers: {},
          body: isAbort
            ? `Request timed out after ${requestTimeout}ms`
            : `Unable to reach proxy server (${errMsg}). Ensure the desktop app or local proxy server is running.`,
          time: 0,
          size: 0,
        };
      }
    }
  }

  // Attach outbound request representation
  if (responseData) {
    responseData.outbound = outbound;
  }

  // 4. Run Post-response (Tests) Scripts in Postman order:
  //    Collection Tests -> Folder(s) Tests (outer to inner) -> Request Tests
  const postScripts: { source: string; code: string }[] = [];
  if (effectiveCollection?.postScript && effectiveCollection.postScript.trim()) {
    postScripts.push({
      source: `Collection "${effectiveCollection.name}"`,
      code: effectiveCollection.postScript,
    });
  }
  for (const folder of parentFolders) {
    if (folder.postScript && folder.postScript.trim()) {
      postScripts.push({
        source: `Folder "${folder.name}"`,
        code: folder.postScript,
      });
    }
  }
  if (effectiveSnap.postScript && effectiveSnap.postScript.trim()) {
    postScripts.push({
      source: `Request "${effectiveSnap.name || "Draft"}"`,
      code: effectiveSnap.postScript,
    });
  }

  const allTestResults: TestResult[] = [];
  for (const item of postScripts) {
    try {
      const postResult = await runScript(
        "post",
        item.code,
        effectiveEnv,
        effectiveSnap,
        responseData,
        effectiveCollection,
        executionVars
      );
      if (postResult.envModified) {
        effectiveEnv = { ...effectiveEnv, variables: postResult.updatedEnvVariables };
        if (onEnvUpdate) {
          onEnvUpdate(postResult.updatedEnvVariables);
        }
      }
      if (postResult.collectionModified && effectiveCollection) {
        effectiveCollection = {
          ...effectiveCollection,
          variables: postResult.updatedCollectionVariables,
        };
        if (options?.onCollectionUpdate) {
          options.onCollectionUpdate(postResult.updatedCollectionVariables);
        }
      }
      if (postResult.executionVariables) {
        for (const [k, v] of Object.entries(postResult.executionVariables)) {
          executionVars.set(k, v);
        }
      }
      allTestResults.push(...postResult.testResults);
      for (const log of postResult.consoleLogs) {
        allScriptLogs.push(`[Tests (${item.source})] ${log.message}`);
      }
    } catch (err) {
      allScriptLogs.push(`[Tests Error (${item.source})] ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (allTestResults.length > 0) {
    responseData.testResults = allTestResults;
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
