import type {
  AuthConfig,
  Collection,
  Environment,
  FolderItem,
  HttpMethod,
  KeyValue,
  RequestItem,
  TreeNode,
} from "./types";
import { emptyAuth, emptySnapshot, METHODS, snapshotToRequest } from "./types";
import { kv, uid } from "./id";
import { parseCurl } from "./curl";

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function methodOf(v: unknown): RequestItem["method"] {
  const m = asString(v, "GET").toUpperCase();
  return (METHODS as string[]).includes(m) ? (m as RequestItem["method"]) : "GET";
}

function fromPostmanKv(list: unknown): KeyValue[] {
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    const row = item as Record<string, unknown>;
    const disabled = Boolean(row.disabled);
    return kv(asString(row.key), asString(row.value), !disabled);
  });
}

function authFromPostman(raw: unknown): AuthConfig {
  const auth = emptyAuth();
  if (!raw || typeof raw !== "object") return auth;
  const obj = raw as Record<string, unknown>;
  const type = asString(obj.type, "noauth");
  const find = (kind: string, key: string) => {
    const arr = obj[kind];
    if (!Array.isArray(arr)) return "";
    const hit = arr.find((x) => asString((x as Record<string, unknown>).key) === key) as
      | Record<string, unknown>
      | undefined;
    return hit ? asString(hit.value) : "";
  };
  if (type === "bearer") {
    auth.type = "bearer";
    auth.bearerToken = find("bearer", "token");
  } else if (type === "basic") {
    auth.type = "basic";
    auth.basicUser = find("basic", "username");
    auth.basicPass = find("basic", "password");
  } else if (type === "apikey") {
    auth.type = "apikey";
    auth.apiKeyName = find("apikey", "key");
    auth.apiKeyValue = find("apikey", "value");
    auth.apiKeyIn = find("apikey", "in") === "query" ? "query" : "header";
  }
  return auth;
}

function urlFromPostman(raw: unknown): { url: string; params: KeyValue[] } {
  if (typeof raw === "string") return { url: raw, params: [] };
  if (!raw || typeof raw !== "object") return { url: "", params: [] };
  const obj = raw as Record<string, unknown>;
  const rawUrl = asString(obj.raw);
  const params = fromPostmanKv(obj.query);
  if (rawUrl) {
    const q = rawUrl.indexOf("?");
    return { url: q >= 0 ? rawUrl.slice(0, q) : rawUrl, params };
  }
  const host = Array.isArray(obj.host) ? obj.host.join(".") : asString(obj.host);
  const path = Array.isArray(obj.path) ? "/" + obj.path.join("/") : asString(obj.path);
  const protocol = asString(obj.protocol, "https");
  return { url: host ? `${protocol}://${host}${path}` : "", params };
}

function itemFromPostman(item: Record<string, unknown>): TreeNode {
  const name = asString(item.name, "Untitled");
  if (Array.isArray(item.item)) {
    const folder: FolderItem = {
      id: uid("fld"),
      type: "folder",
      name,
      children: item.item.map((child) => itemFromPostman(child as Record<string, unknown>)),
    };
    return folder;
  }
  const req = (item.request ?? {}) as Record<string, unknown>;
  const { url, params } = urlFromPostman(req.url);
  const bodyObj = (req.body ?? {}) as Record<string, unknown>;
  const mode = asString(bodyObj.mode, "none");
  let bodyMode: RequestItem["bodyMode"] = "none";
  let body = "";
  if (mode === "raw") {
    body = asString(bodyObj.raw);
    const options = (bodyObj.options ?? {}) as Record<string, unknown>;
    const raw = (options.raw ?? {}) as Record<string, unknown>;
    bodyMode = asString(raw.language) === "json" ? "json" : "raw";
  } else if (mode === "urlencoded") {
    bodyMode = "form-urlencoded";
    body = fromPostmanKv(bodyObj.urlencoded)
      .filter((r) => r.enabled)
      .map((r) => `${r.key}=${r.value}`)
      .join("\n");
  }
  const request: RequestItem = {
    id: uid("req"),
    type: "request",
    name,
    method: methodOf(req.method),
    url,
    params,
    headers: fromPostmanKv(req.header),
    bodyMode,
    body,
    auth: authFromPostman(req.auth),
  };
  return request;
}

export function importPostmanCollection(json: unknown): Collection {
  const root = json as Record<string, unknown>;
  const info = (root.info ?? {}) as Record<string, unknown>;
  const items = Array.isArray(root.item) ? root.item : [];
  const rawVars = Array.isArray(root.variable)
    ? root.variable
    : Array.isArray(root.variables)
    ? root.variables
    : [];
  const variables = rawVars.map(envValue).filter((v) => v.key.trim().length > 0);

  return {
    id: uid("col"),
    name: asString(info.name, "Imported Collection"),
    description: asString(info.description),
    children: items.map((item) => itemFromPostman(item as Record<string, unknown>)),
    variables,
  };
}

function stringifyVal(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function envValue(item: unknown): KeyValue {
  const row = (item ?? {}) as Record<string, unknown>;
  const enabled = row.enabled !== false && row.disabled !== true;
  const key = asString(row.key) || asString(row.name) || asString(row.keyName);

  const val =
    row.value != null && row.value !== ""
      ? stringifyVal(row.value)
      : row.currentValue != null && row.currentValue !== ""
      ? stringifyVal(row.currentValue)
      : row.initialValue != null && row.initialValue !== ""
      ? stringifyVal(row.initialValue)
      : stringifyVal(row.value);

  return kv(key.trim(), val, enabled);
}

function valuesFromObject(data: unknown): KeyValue[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return Object.entries(data as Record<string, unknown>).map(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const vObj = value as Record<string, unknown>;
      return envValue({ key, ...vObj });
    }
    return kv(key.trim(), stringifyVal(value), true);
  });
}

export function isPostmanEnvironment(json: unknown): boolean {
  if (!json || typeof json !== "object" || Array.isArray(json)) return false;
  const root = json as Record<string, unknown>;
  if (root.environment && typeof root.environment === "object") {
    return isPostmanEnvironment(root.environment);
  }
  const scope = asString(root._postman_variable_scope).toLowerCase();
  if (scope === "environment" || scope === "globals") return true;
  const info = (root.info ?? {}) as Record<string, unknown>;
  const schema = asString(info.schema).toLowerCase();
  if (schema.includes("environment")) return true;
  if (Array.isArray(root.item) || schema.includes("collection")) return false;
  if (Array.isArray(root.values) || Array.isArray(root.variables)) return true;
  if (root.data && typeof root.data === "object" && !Array.isArray(root.data)) return true;
  return false;
}

export function isPostmanCollection(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const root = json as Record<string, unknown>;
  const info = (root.info ?? {}) as Record<string, unknown>;
  const schema = asString(info.schema).toLowerCase();
  if (schema.includes("collection")) return true;
  if (Array.isArray(root.item)) return true;
  return false;
}

export function importPostmanEnvironment(json: unknown): Environment {
  const incoming = json as Record<string, unknown>;
  const root =
    incoming.environment && typeof incoming.environment === "object"
      ? (incoming.environment as Record<string, unknown>)
      : incoming;
  const scope = asString(root._postman_variable_scope).toLowerCase();
  let values: unknown[] = [];
  if (Array.isArray(root.values)) values = root.values;
  else if (Array.isArray(root.variables)) values = root.variables;
  const fromList = values.map(envValue).filter((v) => v.key.trim().length > 0);
  const fromData = fromList.length === 0 ? valuesFromObject(root.data) : [];
  const fallback = scope === "globals" ? "Postman Globals" : "Imported Environment";
  return {
    id: uid("env"),
    name: asString(root.name, fallback),
    variables: fromList.length ? fromList : fromData,
  };
}

export type ImportKind = "collection" | "environment";

export interface ImportResult {
  kind: ImportKind;
  collection?: Collection;
  environment?: Environment;
}

export function isSimpleKvEnvironment(json: unknown): boolean {
  if (!json || typeof json !== "object" || Array.isArray(json)) return false;
  const root = json as Record<string, unknown>;
  if (root.item || (root.info && typeof root.info === "object")) return false;
  const entries = Object.entries(root);
  if (entries.length === 0) return false;
  return entries.every(
    ([_, v]) =>
      v === null ||
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
  );
}

export function importPostmanFile(json: unknown, fallbackName?: string): ImportResult {
  if (isPostmanEnvironment(json)) {
    return { kind: "environment", environment: importPostmanEnvironment(json) };
  }
  if (isPostmanCollection(json)) {
    return { kind: "collection", collection: importPostmanCollection(json) };
  }
  if (isSimpleKvEnvironment(json)) {
    const root = json as Record<string, unknown>;
    return {
      kind: "environment",
      environment: {
        id: uid("env"),
        name: fallbackName || "Imported Environment",
        variables: Object.entries(root).map(([k, v]) =>
          kv(k, v == null ? "" : String(v), true)
        ),
      },
    };
  }
  throw new Error(
    "Unrecognized file. Export a Postman Collection v2.1 or Environment (.json)."
  );
}

export async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let pos = 0;
  while (pos < bytes.length - 30) {
    if (
      bytes[pos] === 0x50 &&
      bytes[pos + 1] === 0x4b &&
      bytes[pos + 2] === 0x03 &&
      bytes[pos + 3] === 0x04
    ) {
      const compressionMethod = bytes[pos + 8] | (bytes[pos + 9] << 8);
      const compressedSize =
        bytes[pos + 18] |
        (bytes[pos + 19] << 8) |
        (bytes[pos + 20] << 16) |
        (bytes[pos + 21] << 24);
      const fileNameLen = bytes[pos + 26] | (bytes[pos + 27] << 8);
      const extraFieldLen = bytes[pos + 28] | (bytes[pos + 29] << 8);
      const fileNameBytes = bytes.slice(pos + 30, pos + 30 + fileNameLen);
      const fileName = new TextDecoder().decode(fileNameBytes);
      const fileDataStart = pos + 30 + fileNameLen + extraFieldLen;
      if (fileName === "word/document.xml") {
        const fileData = bytes.slice(fileDataStart, fileDataStart + compressedSize);
        let xmlText = "";
        if (compressionMethod === 8 && typeof DecompressionStream !== "undefined") {
          try {
            const ds = new DecompressionStream("deflate-raw");
            const writer = ds.writable.getWriter();
            writer.write(fileData);
            writer.close();
            xmlText = await new Response(ds.readable).text();
          } catch {
            // fallback
          }
        } else if (compressionMethod === 0) {
          xmlText = new TextDecoder().decode(fileData);
        }
        if (xmlText) {
          return xmlText
            .replace(/<w:p[^>]*>/g, "\n")
            .replace(/<[^>]+>/g, " ")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"');
        }
      }
      pos = fileDataStart + Math.max(0, compressedSize);
    } else {
      pos++;
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/[^\x20-\x7E\r\n\t]/g, " ");
}

export function parseDocToCollection(text: string, defaultName: string): Collection {
  const collectionId = uid("col");
  let colName = defaultName.replace(/\.[^/.]+$/, "");
  const colDesc = "Imported from documentation";

  // Check if first markdown heading # Title exists
  const titleMatch = text.match(/^#\s+(.+)$/m);
  if (titleMatch && titleMatch[1]) {
    colName = titleMatch[1].trim();
  }

  // Detect base URL from text (e.g. Base URL: https://api.example.com, Host: ..., Server: ...)
  let detectedBaseUrl = "";
  const baseMatch = text.match(
    /(?:base\s*url|host|server)\s*[:=]\s*[`"']?(https?:\/\/[^\s`"')]+)/i
  );
  if (baseMatch && baseMatch[1]) {
    detectedBaseUrl = baseMatch[1].replace(/\/+$/, "");
  }

  const items: TreeNode[] = [];
  const seenEndpoints = new Set<string>();

  // 1. Extract cURL commands
  const curlRegex = /curl\s+[^`\n\r]+(?:\\[\r\n]+[^`\n\r]+)*/gi;
  let curlHit: RegExpExecArray | null;
  while ((curlHit = curlRegex.exec(text)) !== null) {
    const rawCmd = curlHit[0].replace(/\\\r?\n/g, " ").trim();
    if (rawCmd.length > 8) {
      try {
        const snap = parseCurl(rawCmd);
        const key = `${snap.method}:${snap.url}`;
        if (!seenEndpoints.has(key)) {
          seenEndpoints.add(key);
          items.push(snapshotToRequest(uid("req"), snap));
        }
      } catch {
        // ignore malformed curl
      }
    }
  }

  // 2. Extract Markdown table rows: | Method | Endpoint/URL | Description |
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const maybeMethod = parts[0].toUpperCase();
      if ((METHODS as readonly string[]).includes(maybeMethod)) {
        const endpoint = parts[1].replace(/[`*]/g, "").trim();
        const desc = parts[2] ? parts[2].replace(/[`*]/g, "").trim() : "";
        if (
          endpoint.startsWith("/") ||
          endpoint.startsWith("http://") ||
          endpoint.startsWith("https://") ||
          endpoint.startsWith("ws://") ||
          endpoint.startsWith("wss://") ||
          endpoint.startsWith("{{")
        ) {
          const fullUrl =
            endpoint.startsWith("http") || endpoint.startsWith("ws") || endpoint.startsWith("{{")
              ? endpoint
              : detectedBaseUrl
              ? `${detectedBaseUrl}${endpoint}`
              : endpoint;
          const key = `${maybeMethod}:${fullUrl}`;
          if (!seenEndpoints.has(key)) {
            seenEndpoints.add(key);
            const req = snapshotToRequest(
              uid("req"),
              emptySnapshot({
                name: desc || `${maybeMethod} ${endpoint}`,
                method: maybeMethod as HttpMethod,
                url: fullUrl,
              })
            );
            items.push(req);
          }
        }
      }
    }
  }

  // 3. Extract Headings and List Items with HTTP Methods:
  // e.g., "### GET /api/v1/users", "## POST /auth/login", "- **GET** `/orders` - Get all orders"
  const methodRegex =
    /(?:^|\n)(?:#{1,6}\s+|-\s+|\*\s+)?(?:\*\*)?(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|WS)(?:\*\*)?\s+[`"']?([/a-zA-Z0-9_\-.:{}$]+)[`"']?(?:[ \t]*[-:–][ \t]*(.+))?/gi;
  let methodHit: RegExpExecArray | null;
  while ((methodHit = methodRegex.exec(text)) !== null) {
    const method = methodHit[1].toUpperCase() as HttpMethod;
    const endpoint = methodHit[2].trim();
    const desc = methodHit[3] ? methodHit[3].trim() : "";

    if (
      endpoint.startsWith("/") ||
      endpoint.startsWith("http://") ||
      endpoint.startsWith("https://") ||
      endpoint.startsWith("ws://") ||
      endpoint.startsWith("wss://") ||
      endpoint.startsWith("{{")
    ) {
      const fullUrl =
        endpoint.startsWith("http") || endpoint.startsWith("ws") || endpoint.startsWith("{{")
          ? endpoint
          : detectedBaseUrl
          ? `${detectedBaseUrl}${endpoint}`
          : endpoint;

      const key = `${method}:${fullUrl}`;
      if (!seenEndpoints.has(key)) {
        seenEndpoints.add(key);

        // Check if there is an immediately following JSON code block for request body
        let body = "";
        let bodyMode: RequestItem["bodyMode"] = "none";
        const afterText = text.slice(
          methodHit.index + methodHit[0].length,
          methodHit.index + methodHit[0].length + 1000
        );
        const jsonBlockMatch = afterText.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (
          jsonBlockMatch &&
          jsonBlockMatch[1] &&
          (method === "POST" || method === "PUT" || method === "PATCH")
        ) {
          const candidate = jsonBlockMatch[1].trim();
          if (candidate.startsWith("{") || candidate.startsWith("[")) {
            body = candidate;
            bodyMode = "json";
          }
        }

        const req = snapshotToRequest(
          uid("req"),
          emptySnapshot({
            name: desc || `${method} ${endpoint}`,
            method,
            url: fullUrl,
            body,
            bodyMode,
          })
        );
        items.push(req);
      }
    }
  }

  // Fallback: If no structured endpoints found, extract any URLs in the document
  if (items.length === 0) {
    const urlRegex = /https?:\/\/[^\s`"'<>()]+/gi;
    let urlHit: RegExpExecArray | null;
    let count = 1;
    while ((urlHit = urlRegex.exec(text)) !== null && count <= 15) {
      const url = urlHit[0].replace(/[.,;:)]$/, "");
      if (!seenEndpoints.has(url)) {
        seenEndpoints.add(url);
        items.push(
          snapshotToRequest(
            uid("req"),
            emptySnapshot({
              name: `Endpoint ${count++}`,
              method: "GET",
              url,
            })
          )
        );
      }
    }
  }

  return {
    id: collectionId,
    name: colName || "Imported API Collection",
    description: colDesc,
    children: items,
  };
}

export async function parseImportFiles(files: FileList | File[]): Promise<{
  collections: Collection[];
  environments: Environment[];
  errors: string[];
}> {
  const collections: Collection[] = [];
  const environments: Environment[] = [];
  const errors: string[] = [];

  const fileArr = Array.from(files).filter((f) => {
    const n = f.name.toLowerCase();
    return (
      n.endsWith(".json") ||
      n.endsWith(".md") ||
      n.endsWith(".markdown") ||
      n.endsWith(".doc") ||
      n.endsWith(".docx") ||
      n.endsWith(".txt") ||
      f.type === "application/json" ||
      f.type.startsWith("text/") ||
      !n.includes(".")
    );
  });

  if (fileArr.length === 0) {
    return {
      collections,
      environments,
      errors: ["No supported files found (.json, .md, .doc, .docx, .txt)."],
    };
  }

  for (const file of fileArr) {
    const n = file.name.toLowerCase();
    const isDoc =
      n.endsWith(".md") ||
      n.endsWith(".markdown") ||
      n.endsWith(".doc") ||
      n.endsWith(".docx") ||
      n.endsWith(".txt") ||
      file.type === "text/markdown" ||
      file.type === "text/plain";

    if (isDoc) {
      try {
        let text = "";
        if (n.endsWith(".docx")) {
          text = await extractDocxText(await file.arrayBuffer());
        } else {
          text = await file.text();
        }
        const col = parseDocToCollection(text, file.name);
        if (col.children.length > 0) {
          collections.push(col);
        } else {
          errors.push(
            `${file.name}: Could not find any API endpoints, cURL commands, or URLs in this document.`
          );
        }
      } catch (err) {
        errors.push(
          `${file.name}: ${err instanceof Error ? err.message : "Failed to read document"}`
        );
      }
      continue;
    }

    // Process JSON file
    try {
      const text = await file.text();
      const baseName = file.name.replace(/\.json$/i, "");
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        // If not valid JSON, attempt document parsing
        const col = parseDocToCollection(text, file.name);
        if (col.children.length > 0) {
          collections.push(col);
          continue;
        }
        throw new Error("Invalid JSON format and no API endpoints detected.");
      }

      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        try {
          const res = importPostmanFile(item, baseName);
          if (res.kind === "collection" && res.collection) {
            collections.push(res.collection);
          } else if (res.kind === "environment" && res.environment) {
            environments.push(res.environment);
          }
        } catch (innerErr) {
          errors.push(
            `${file.name}: ${innerErr instanceof Error ? innerErr.message : "Not recognized"}`
          );
        }
      }
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : "Invalid JSON"}`);
    }
  }

  return { collections, environments, errors };
}

export function exportPostmanEnvironment(env: Environment): unknown {
  return {
    id: env.id,
    name: env.name,
    values: env.variables.map((v) => ({
      key: v.key,
      value: v.value,
      type: "default",
      enabled: v.enabled,
    })),
    _postman_variable_scope: "environment",
    _postman_exported_using: "Pulse API Studio",
  };
}

function toPostmanKv(rows: KeyValue[]) {
  return rows.map((r) => ({
    key: r.key,
    value: r.value,
    disabled: !r.enabled,
    type: "text",
  }));
}

function toPostmanAuth(auth: AuthConfig) {
  if (auth.type === "none") return undefined;
  if (auth.type === "bearer") {
    return { type: "bearer", bearer: [{ key: "token", value: auth.bearerToken, type: "string" }] };
  }
  if (auth.type === "basic") {
    return {
      type: "basic",
      basic: [
        { key: "username", value: auth.basicUser, type: "string" },
        { key: "password", value: auth.basicPass, type: "string" },
      ],
    };
  }
  return {
    type: "apikey",
    apikey: [
      { key: "key", value: auth.apiKeyName, type: "string" },
      { key: "value", value: auth.apiKeyValue, type: "string" },
      { key: "in", value: auth.apiKeyIn, type: "string" },
    ],
  };
}

function toPostmanItem(node: TreeNode): Record<string, unknown> {
  if (node.type === "folder") {
    return { name: node.name, item: node.children.map(toPostmanItem) };
  }
  const query = toPostmanKv(node.params);
  let body: Record<string, unknown> | undefined;
  if (node.bodyMode === "json") {
    body = {
      mode: "raw",
      raw: node.body,
      options: { raw: { language: "json" } },
    };
  } else if (node.bodyMode === "raw") {
    body = { mode: "raw", raw: node.body };
  } else if (node.bodyMode === "form-urlencoded") {
    body = {
      mode: "urlencoded",
      urlencoded: node.body
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const i = line.indexOf("=");
          return {
            key: i >= 0 ? line.slice(0, i) : line,
            value: i >= 0 ? line.slice(i + 1) : "",
            type: "text",
          };
        }),
    };
  }
  return {
    name: node.name,
    request: {
      method: node.method,
      header: toPostmanKv(node.headers),
      url: {
        raw: node.url,
        query,
      },
      body,
      auth: toPostmanAuth(node.auth),
    },
  };
}

export function exportPostmanCollection(col: Collection): unknown {
  return {
    info: {
      _postman_id: col.id,
      name: col.name,
      description: col.description,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: col.children.map(toPostmanItem),
  };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
