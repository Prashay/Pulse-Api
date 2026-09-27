import type { AppData, Collection, Environment, HistoryEntry } from "./types";
import { emptyAuth } from "./types";
import { kv, uid } from "./id";

const KEY = "pulse-api-studio-v1";

function sampleCollections(): Collection[] {
  return [
    {
      id: uid("col"),
      name: "Local Test Suite",
      description: "Ready-to-run local test suite running against local Pulse backend and mock endpoints.",
      children: [
        {
          id: uid("req"),
          type: "request",
          name: "1. Local Health Check",
          method: "GET",
          url: "{{baseUrl}}/api/health",
          params: [],
          headers: [kv("Accept", "application/json")],
          bodyMode: "none",
          body: "",
          auth: emptyAuth(),
        },
        {
          id: uid("req"),
          type: "request",
          name: "2. Echo Query & Params",
          method: "GET",
          url: "{{baseUrl}}/api/mock/echo",
          params: [kv("client", "pulse-studio"), kv("env", "local-test")],
          headers: [],
          bodyMode: "none",
          body: "",
          auth: emptyAuth(),
        },
        {
          id: uid("req"),
          type: "request",
          name: "3. Post JSON Payload",
          method: "POST",
          url: "{{baseUrl}}/api/mock/echo",
          params: [],
          headers: [kv("Content-Type", "application/json")],
          bodyMode: "json",
          body: '{\n  "service": "pulse-api-studio",\n  "status": "local-test-passed",\n  "token": "{{authToken}}"\n}',
          auth: emptyAuth(),
        },
        {
          id: uid("req"),
          type: "request",
          name: "4. Get Mock Users List",
          method: "GET",
          url: "{{baseUrl}}/api/mock/users",
          params: [],
          headers: [kv("Accept", "application/json")],
          bodyMode: "none",
          body: "",
          auth: emptyAuth(),
        },
        {
          id: uid("req"),
          type: "request",
          name: "5. Bearer Auth Check",
          method: "GET",
          url: "{{baseUrl}}/api/mock/auth-check",
          params: [],
          headers: [],
          bodyMode: "none",
          body: "",
          auth: {
            ...emptyAuth(),
            type: "bearer",
            bearerToken: "{{authToken}}",
          },
        },
      ],
    },
    {
      id: uid("col"),
      name: "HTTPBin Sandbox",
      description: "Sample collection for remote testing GET/POST and auth flows.",
      children: [
        {
          id: uid("req"),
          type: "request",
          name: "Get JSON",
          method: "GET",
          url: "{{remoteUrl}}/json",
          params: [],
          headers: [kv("Accept", "application/json")],
          bodyMode: "none",
          body: "",
          auth: emptyAuth(),
        },
        {
          id: uid("req"),
          type: "request",
          name: "Echo GET params",
          method: "GET",
          url: "{{remoteUrl}}/get",
          params: [kv("page", "1"), kv("q", "pulse")],
          headers: [],
          bodyMode: "none",
          body: "",
          auth: emptyAuth(),
        },
        {
          id: uid("req"),
          type: "request",
          name: "Post JSON",
          method: "POST",
          url: "{{remoteUrl}}/post",
          params: [],
          headers: [kv("Content-Type", "application/json")],
          bodyMode: "json",
          body: '{\n  "product": "Pulse API Studio",\n  "ok": true\n}',
          auth: emptyAuth(),
        },
      ],
    },
  ];
}

function sampleEnvironments(): Environment[] {
  return [
    {
      id: uid("env"),
      name: "Localhost (3001)",
      variables: [
        kv("baseUrl", "http://127.0.0.1:3001"),
        kv("authToken", "pulse-secret-token-42"),
        kv("remoteUrl", "https://httpbin.org"),
      ],
    },
    {
      id: uid("env"),
      name: "Remote Sandbox",
      variables: [
        kv("baseUrl", "https://httpbin.org"),
        kv("remoteUrl", "https://httpbin.org"),
        kv("authToken", "demo-token"),
      ],
    },
  ];
}

export function defaultData(): AppData {
  const environments = sampleEnvironments();
  return {
    collections: sampleCollections(),
    environments,
    activeEnvId: environments[0]?.id ?? null,
    history: [],
  };
}

export function loadData(): AppData {
  try {
    const raw =
      localStorage.getItem(KEY) ||
      localStorage.getItem("forge-api-studio-v2") ||
      localStorage.getItem("forge-api-studio-v1");
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw) as AppData;
    if (!Array.isArray(parsed.collections) || parsed.collections.length === 0) return defaultData();
    return {
      collections: parsed.collections,
      environments: parsed.environments && parsed.environments.length > 0 ? parsed.environments : sampleEnvironments(),
      activeEnvId: parsed.activeEnvId ?? parsed.environments?.[0]?.id ?? null,
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, 80) : [],
    };
  } catch {
    return defaultData();
  }
}

export function saveData(data: AppData): void {
  const trimmed: AppData = {
    ...data,
    history: data.history.slice(0, 80),
  };
  localStorage.setItem(KEY, JSON.stringify(trimmed));
}

export function pushHistory(
  history: HistoryEntry[],
  entry: HistoryEntry
): HistoryEntry[] {
  return [entry, ...history].slice(0, 80);
}
