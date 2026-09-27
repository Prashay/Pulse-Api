import type { Collection, Environment, HttpMethod, RequestSnapshot } from "./types";
import { emptyAuth, emptySnapshot, METHODS } from "./types";
import { kv } from "./id";
import { interpolate } from "./request";

function unquote(raw: string): string {
  const s = raw.trim();
  if (
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('"') && s.endsWith('"'))
  ) {
    const inner = s.slice(1, -1);
    if (s.startsWith('"')) {
      return inner.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    return inner;
  }
  return s;
}

function tokenize(input: string): string[] {
  const src = input.replace(/\\\r?\n/g, " ").replace(/\r?\n/g, " ").trim();
  const tokens: string[] = [];
  let i = 0;
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (i >= src.length) break;
    const q = src[i];
    if (q === "'" || q === '"') {
      i++;
      let buf = "";
      while (i < src.length && src[i] !== q) {
        if (q === '"' && src[i] === "\\" && i + 1 < src.length) {
          buf += src[i + 1];
          i += 2;
          continue;
        }
        buf += src[i];
        i++;
      }
      if (src[i] === q) i++;
      tokens.push(buf);
      continue;
    }
    let buf = "";
    while (i < src.length && !/\s/.test(src[i])) {
      buf += src[i];
      i++;
    }
    tokens.push(buf);
  }
  return tokens;
}

function asMethod(v: string): HttpMethod {
  const m = v.toUpperCase();
  return (METHODS as string[]).includes(m) ? (m as HttpMethod) : "GET";
}

export function parseCurl(raw: string): RequestSnapshot {
  const text = raw.trim();
  if (!text) throw new Error("Paste a curl command first");
  const tokens = tokenize(text);
  if (tokens.length === 0) throw new Error("Could not parse curl command");
  if (tokens[0].toLowerCase() !== "curl") {
    throw new Error("Command must start with curl");
  }

  let method: HttpMethod | null = null;
  let url = "";
  const headers: { key: string; value: string }[] = [];
  let body = "";
  let hasData = false;
  let user = "";
  let pass = "";
  let bearer = "";
  let compressed = false;

  const next = (i: number) => tokens[i + 1] ?? "";

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-X" || t === "--request") {
      method = asMethod(next(i));
      i++;
      continue;
    }
    if (t.startsWith("-X") && t.length > 2) {
      method = asMethod(t.slice(2));
      continue;
    }
    if (t === "-H" || t === "--header") {
      const hv = next(i);
      i++;
      const idx = hv.indexOf(":");
      if (idx >= 0) {
        const key = hv.slice(0, idx).trim();
        const value = hv.slice(idx + 1).trim();
        if (key.toLowerCase() === "authorization" && /^bearer\s+/i.test(value)) {
          bearer = value.replace(/^bearer\s+/i, "");
        } else {
          headers.push({ key, value });
        }
      }
      continue;
    }
    if (
      t === "-d" ||
      t === "--data" ||
      t === "--data-raw" ||
      t === "--data-binary" ||
      t === "--data-ascii" ||
      t === "--data-urlencode"
    ) {
      body = next(i);
      hasData = true;
      i++;
      continue;
    }
    if (t.startsWith("--data=") || t.startsWith("--data-raw=")) {
      body = unquote(t.slice(t.indexOf("=") + 1));
      hasData = true;
      continue;
    }
    if (t === "-u" || t === "--user") {
      const cred = next(i);
      i++;
      const c = cred.indexOf(":");
      user = c >= 0 ? cred.slice(0, c) : cred;
      pass = c >= 0 ? cred.slice(c + 1) : "";
      continue;
    }
    if (t === "-A" || t === "--user-agent") {
      headers.push({ key: "User-Agent", value: next(i) });
      i++;
      continue;
    }
    if (t === "-b" || t === "--cookie") {
      headers.push({ key: "Cookie", value: next(i) });
      i++;
      continue;
    }
    if (t === "-e" || t === "--referer") {
      headers.push({ key: "Referer", value: next(i) });
      i++;
      continue;
    }
    if (
      t === "-L" ||
      t === "--location" ||
      t === "--compressed" ||
      t === "-s" ||
      t === "--silent" ||
      t === "-k" ||
      t === "--insecure" ||
      t === "-i" ||
      t === "--include" ||
      t === "-v" ||
      t === "--verbose" ||
      t === "-I" ||
      t === "--head"
    ) {
      if (t === "--compressed") compressed = true;
      if (t === "-I" || t === "--head") method = "HEAD";
      continue;
    }
    if (t === "--url") {
      url = next(i);
      i++;
      continue;
    }
    if (t.startsWith("-") ) continue;
    if (!url) url = t;
  }

  if (!url) throw new Error("No URL found in curl command");
  if (compressed && !headers.some((h) => h.key.toLowerCase() === "accept-encoding")) {
    headers.push({ key: "Accept-Encoding", value: "gzip, deflate, br" });
  }

  let parsedUrl = url;
  const params: RequestSnapshot["params"] = [];
  try {
    const u = new URL(url);
    u.searchParams.forEach((value, key) => params.push(kv(key, value, true)));
    parsedUrl = `${u.origin}${u.pathname}`;
  } catch {
    const q = url.indexOf("?");
    if (q >= 0) {
      parsedUrl = url.slice(0, q);
      const qs = new URLSearchParams(url.slice(q + 1));
      qs.forEach((value, key) => params.push(kv(key, value, true)));
    }
  }

  const ct = headers.find((h) => h.key.toLowerCase() === "content-type")?.value.toLowerCase() ?? "";
  let bodyMode: RequestSnapshot["bodyMode"] = "none";
  if (hasData) {
    if (ct.includes("application/x-www-form-urlencoded")) bodyMode = "form-urlencoded";
    else if (ct.includes("json") || looksJson(body)) bodyMode = "json";
    else bodyMode = "raw";
  }
  if (bodyMode === "form-urlencoded") {
    body = body
      .split("&")
      .map((p) => decodeURIComponent(p.replace(/\+/g, " ")))
      .join("\n");
  }

  const auth = emptyAuth();
  if (bearer) {
    auth.type = "bearer";
    auth.bearerToken = bearer;
  } else if (user || pass) {
    auth.type = "basic";
    auth.basicUser = user;
    auth.basicPass = pass;
  }

  const name = nameFromUrl(parsedUrl);
  return emptySnapshot({
    name,
    method: method ?? (hasData ? "POST" : "GET"),
    url: parsedUrl,
    params,
    headers: headers.map((h) => kv(h.key, h.value, true)),
    bodyMode,
    body,
    auth,
  });
}

function looksJson(raw: string): boolean {
  const t = raw.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

function nameFromUrl(url: string): string {
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.length ? decodeURIComponent(parts[parts.length - 1]) : u.host;
  } catch {
    return "Imported cURL";
  }
}

function shellQuote(value: string): string {
  if (value === "") return "''";
  if (/^[A-Za-z0-9_\-.:/=?&]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function toCurl(
  snap: RequestSnapshot,
  env?: Environment | null,
  collection?: Collection | null
): string {
  let url = interpolate(snap.url, env ?? null, collection ?? null);
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/.*)?$/i.test(url)) {
    url = `http://${url}`;
  }

  // Handle query params on URL
  if (snap.params.some((p) => p.enabled && p.key.trim())) {
    try {
      const u = new URL(url);
      for (const p of snap.params) {
        if (!p.enabled || !p.key.trim()) continue;
        const k = interpolate(p.key.trim(), env ?? null, collection ?? null);
        const v = interpolate(p.value, env ?? null, collection ?? null);
        u.searchParams.append(k, v);
      }
      url = u.toString();
    } catch {
      // Keep existing url if invalid URL
    }
  }

  const lines: string[] = ["curl --location"];
  if (snap.method !== "GET") lines.push(`--request ${snap.method}`);
  lines.push(shellQuote(url));

  for (const h of snap.headers) {
    if (!h.enabled || !h.key.trim()) continue;
    const k = interpolate(h.key.trim(), env ?? null, collection ?? null);
    const v = interpolate(h.value, env ?? null, collection ?? null);
    lines.push(`--header ${shellQuote(`${k}: ${v}`)}`);
  }

  if (snap.auth.type === "bearer" && snap.auth.bearerToken) {
    const token = interpolate(snap.auth.bearerToken, env ?? null, collection ?? null);
    lines.push(`--header ${shellQuote(`Authorization: Bearer ${token}`)}`);
  } else if (snap.auth.type === "basic") {
    const u = interpolate(snap.auth.basicUser, env ?? null, collection ?? null);
    const p = interpolate(snap.auth.basicPass, env ?? null, collection ?? null);
    lines.push(`--user ${shellQuote(`${u}:${p}`)}`);
  } else if (snap.auth.type === "apikey" && snap.auth.apiKeyName && snap.auth.apiKeyIn === "header") {
    const k = interpolate(snap.auth.apiKeyName, env ?? null, collection ?? null);
    const v = interpolate(snap.auth.apiKeyValue, env ?? null, collection ?? null);
    lines.push(`--header ${shellQuote(`${k}: ${v}`)}`);
  }

  if (snap.bodyMode !== "none" && snap.body && !["GET", "HEAD"].includes(snap.method)) {
    let payload = interpolate(snap.body, env ?? null, collection ?? null);
    if (snap.bodyMode === "form-urlencoded") {
      payload = snap.body
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const i = line.indexOf("=");
          const k = i >= 0 ? line.slice(0, i) : line;
          const v = i >= 0 ? line.slice(i + 1) : "";
          const ik = interpolate(k, env ?? null, collection ?? null);
          const iv = interpolate(v, env ?? null, collection ?? null);
          return `${encodeURIComponent(ik)}=${encodeURIComponent(iv)}`;
        })
        .join("&");
    }
    lines.push(`--data ${shellQuote(payload)}`);
  }

  if (lines.length === 2) return `${lines[0]} ${lines[1]}`;
  return lines
    .map((line, idx) => (idx === 0 ? `${line} \\` : idx === lines.length - 1 ? `  ${line}` : `  ${line} \\`))
    .join("\n");
}
