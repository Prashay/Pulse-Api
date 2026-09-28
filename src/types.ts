export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "WS";

export type BodyMode = "none" | "raw" | "json" | "form-urlencoded";
export type AuthType = "none" | "bearer" | "basic" | "apikey";
export type AuthApiKeyIn = "header" | "query";

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

export interface AuthConfig {
  type: AuthType;
  bearerToken: string;
  basicUser: string;
  basicPass: string;
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyIn: AuthApiKeyIn;
}

export interface RequestSnapshot {
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  bodyMode: BodyMode;
  body: string;
  auth: AuthConfig;
}

export interface RequestItem {
  id: string;
  type: "request";
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  bodyMode: BodyMode;
  body: string;
  auth: AuthConfig;
}

export interface FolderItem {
  id: string;
  type: "folder";
  name: string;
  children: TreeNode[];
}

export type TreeNode = RequestItem | FolderItem;

export interface Collection {
  id: string;
  name: string;
  description: string;
  children: TreeNode[];
  variables?: KeyValue[];
}

export interface Environment {
  id: string;
  name: string;
  variables: KeyValue[];
}

export interface TabState {
  id: string;
  requestId: string | null;
  collectionId: string | null;
  name: string;
  dirty: boolean;
  draft: RequestSnapshot;
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  method: HttpMethod;
  url: string;
  status: number;
  time: number;
  ok: boolean;
  error: boolean;
}

export interface ProxyResponse {
  ok: boolean;
  error: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
}

export interface ConsoleLog {
  id: string;
  timestamp: number;
  type: "network" | "log" | "info" | "warn" | "error";
  title: string;
  method?: HttpMethod;
  url?: string;
  status?: number;
  statusText?: string;
  time?: number;
  size?: number;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  curl?: string;
}

export interface RunResult {
  requestId: string;
  name: string;
  method: HttpMethod;
  url: string;
  status: number;
  statusText: string;
  time: number;
  size: number;
  ok: boolean;
  error: boolean;
  body: string;
  headers?: Record<string, string>;
}

export interface AppData {
  collections: Collection[];
  environments: Environment[];
  activeEnvId: string | null;
  history: HistoryEntry[];
}

export const METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "WS",
];

export const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "method-get",
  POST: "method-post",
  PUT: "method-put",
  PATCH: "method-patch",
  DELETE: "method-delete",
  HEAD: "method-head",
  OPTIONS: "method-options",
  WS: "method-ws",
};

export function emptyAuth(): AuthConfig {
  return {
    type: "none",
    bearerToken: "",
    basicUser: "",
    basicPass: "",
    apiKeyName: "",
    apiKeyValue: "",
    apiKeyIn: "header",
  };
}

export function emptySnapshot(partial?: Partial<RequestSnapshot>): RequestSnapshot {
  return {
    name: "Untitled Request",
    method: "GET",
    url: "",
    params: [],
    headers: [],
    bodyMode: "none",
    body: "",
    auth: emptyAuth(),
    ...partial,
  };
}

export function requestToSnapshot(req: RequestItem): RequestSnapshot {
  return {
    name: req.name,
    method: req.method,
    url: req.url,
    params: req.params.map((p) => ({ ...p })),
    headers: req.headers.map((h) => ({ ...h })),
    bodyMode: req.bodyMode,
    body: req.body,
    auth: { ...req.auth },
  };
}

export function snapshotToRequest(
  id: string,
  snap: RequestSnapshot
): RequestItem {
  return {
    id,
    type: "request",
    name: snap.name,
    method: snap.method,
    url: snap.url,
    params: snap.params.map((p) => ({ ...p })),
    headers: snap.headers.map((h) => ({ ...h })),
    bodyMode: snap.bodyMode,
    body: snap.body,
    auth: { ...snap.auth },
  };
}
