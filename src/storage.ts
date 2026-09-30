import type { AppData, Collection, Environment, HistoryEntry, RequestItem } from "./types";
import { emptyAuth } from "./types";
import { kv } from "./id";

const KEY = "pulse-api-studio-v1";

export function createSampleEnvironments(): Environment[] {
  return [
    {
      id: "env_dev",
      name: "Development (Localhost)",
      variables: [
        kv("baseUrl", "http://127.0.0.1:3001"),
        kv("apiKey", "pulse_dev_token_8892"),
        kv("environment", "development"),
        kv("port", "3001"),
        kv("timeout", "5000"),
      ],
    },
    {
      id: "env_staging",
      name: "Staging (API Sandbox)",
      variables: [
        kv("baseUrl", "https://httpbin.org"),
        kv("apiKey", "staging_token_7719_secure"),
        kv("environment", "staging"),
        kv("version", "v2"),
        kv("timeout", "8000"),
      ],
    },
    {
      id: "env_prod_sandbox",
      name: "Production (Sandbox)",
      variables: [
        kv("baseUrl", "https://jsonplaceholder.typicode.com"),
        kv("apiKey", "live_bearer_secure_key"),
        kv("environment", "production"),
        kv("timeout", "10000"),
      ],
    },
  ];
}

export function createSampleCollections(): Collection[] {
  const localHealthReq: RequestItem = {
    id: "req_pulse_health",
    type: "request",
    name: "Proxy Health Check",
    method: "GET",
    url: "http://127.0.0.1:3001/api/health",
    params: [],
    headers: [kv("Accept", "application/json")],
    bodyMode: "none",
    body: "",
    auth: emptyAuth(),
  };

  const localUsersReq: RequestItem = {
    id: "req_pulse_mock_users",
    type: "request",
    name: "List Mock Users",
    method: "GET",
    url: "http://127.0.0.1:3001/api/mock/users",
    params: [],
    headers: [kv("Accept", "application/json")],
    bodyMode: "none",
    body: "",
    auth: emptyAuth(),
  };

  const localAuthReq: RequestItem = {
    id: "req_pulse_auth_check",
    type: "request",
    name: "Auth Protected Check",
    method: "GET",
    url: "http://127.0.0.1:3001/api/mock/auth-check",
    params: [],
    headers: [
      kv("Accept", "application/json"),
      kv("Authorization", "Bearer {{apiKey}}"),
    ],
    bodyMode: "none",
    body: "",
    auth: {
      ...emptyAuth(),
      type: "bearer",
      bearerToken: "{{apiKey}}",
    },
  };

  const localEchoReq: RequestItem = {
    id: "req_pulse_echo_post",
    type: "request",
    name: "Echo POST Payload",
    method: "POST",
    url: "http://127.0.0.1:3001/api/mock/echo",
    params: [],
    headers: [kv("Content-Type", "application/json")],
    bodyMode: "json",
    body: JSON.stringify(
      {
        client: "Pulse API Studio",
        status: "active",
        timestamp: Date.now(),
        payload: {
          testPassed: true,
          mode: "developer",
        },
      },
      null,
      2
    ),
    auth: emptyAuth(),
  };

  const getPost1: RequestItem = {
    id: "req_json_get_post1",
    type: "request",
    name: "Get Post by ID (#1)",
    method: "GET",
    url: "https://jsonplaceholder.typicode.com/posts/1",
    params: [],
    headers: [kv("Accept", "application/json")],
    bodyMode: "none",
    body: "",
    auth: emptyAuth(),
  };

  const searchPosts: RequestItem = {
    id: "req_json_search_posts",
    type: "request",
    name: "Filter Posts by User",
    method: "GET",
    url: "https://jsonplaceholder.typicode.com/posts",
    params: [kv("userId", "1"), kv("_limit", "5")],
    headers: [kv("Accept", "application/json")],
    bodyMode: "none",
    body: "",
    auth: emptyAuth(),
  };

  const createPost: RequestItem = {
    id: "req_json_create_post",
    type: "request",
    name: "Create New Post",
    method: "POST",
    url: "https://jsonplaceholder.typicode.com/posts",
    params: [],
    headers: [kv("Content-Type", "application/json; charset=UTF-8")],
    bodyMode: "json",
    body: JSON.stringify(
      {
        title: "Testing Pulse API Studio",
        body: "High-performance developer API client and test runner.",
        userId: 1,
      },
      null,
      2
    ),
    auth: emptyAuth(),
  };

  const listUsers: RequestItem = {
    id: "req_json_list_users",
    type: "request",
    name: "List All Users",
    method: "GET",
    url: "https://jsonplaceholder.typicode.com/users",
    params: [kv("_limit", "3")],
    headers: [kv("Accept", "application/json")],
    bodyMode: "none",
    body: "",
    auth: emptyAuth(),
  };

  const httpbinGet: RequestItem = {
    id: "req_httpbin_echo_get",
    type: "request",
    name: "Echo Query & Headers",
    method: "GET",
    url: "https://httpbin.org/get",
    params: [kv("source", "pulse_studio"), kv("env", "testing")],
    headers: [kv("X-Pulse-Client", "Studio-v1.0")],
    bodyMode: "none",
    body: "",
    auth: emptyAuth(),
  };

  const httpbinStatus200: RequestItem = {
    id: "req_httpbin_status_200",
    type: "request",
    name: "Status Code 200 OK",
    method: "GET",
    url: "https://httpbin.org/status/200",
    params: [],
    headers: [],
    bodyMode: "none",
    body: "",
    auth: emptyAuth(),
  };

  const httpbinStatus404: RequestItem = {
    id: "req_httpbin_status_404",
    type: "request",
    name: "Status Code 404 (Test Error)",
    method: "GET",
    url: "https://httpbin.org/status/404",
    params: [],
    headers: [],
    bodyMode: "none",
    body: "",
    auth: emptyAuth(),
  };

  const httpbinPost: RequestItem = {
    id: "req_httpbin_echo_post",
    type: "request",
    name: "Echo POST Payload (Cloud)",
    method: "POST",
    url: "https://httpbin.org/post",
    params: [],
    headers: [kv("Content-Type", "application/json")],
    bodyMode: "json",
    body: JSON.stringify(
      {
        client: "Pulse API Studio",
        environment: "Cloud Sandbox",
        timestamp: Date.now(),
        echoTest: true,
      },
      null,
      2
    ),
    auth: emptyAuth(),
  };

  return [
    {
      id: "col_pulse_local",
      name: "Pulse Localhost Suite",
      description: "Local Proxy server verification and mock microservice endpoints at 127.0.0.1:3001",
      children: [
        {
          id: "fld_pulse_endpoints",
          type: "folder",
          name: "Microservice Endpoints",
          children: [localHealthReq, localUsersReq, localAuthReq, localEchoReq],
        },
      ],
    },
    {
      id: "col_jsonplaceholder",
      name: "JSONPlaceholder REST API",
      description: "Public REST API endpoints testing GET, query params, and JSON POST body",
      children: [
        {
          id: "fld_posts",
          type: "folder",
          name: "Posts Resource",
          children: [getPost1, searchPosts, createPost],
        },
        listUsers,
      ],
    },
    {
      id: "col_httpbin",
      name: "HTTPBin Echo & Status Sandbox",
      description: "Live validation suite for HTTP query params, headers, and status codes",
      children: [httpbinGet, httpbinPost, httpbinStatus200, httpbinStatus404],
      preScript: `// Collection Pre-request Script: Runs before every request in this collection\npm.environment.set("requestTimestamp", Date.now().toString());\nconsole.log("[Collection Pre-Script] Running for:", pm.request.method, pm.request.url);`,
      postScript: `// Collection Tests: Runs after every response in this collection\npm.test("Collection Global Check: Response Latency is Recorded", function () {\n    pm.expect(pm.response.responseTime).to.be.atLeast(0);\n});`,
    },
  ];
}

export function defaultData(): AppData {
  const sampleEnvs = createSampleEnvironments();
  const sampleCols = createSampleCollections();
  return {
    collections: sampleCols,
    environments: sampleEnvs,
    activeEnvId: sampleEnvs[0]?.id ?? null,
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
    const parsed = JSON.parse(raw) as Partial<AppData>;

    let collections: Collection[] = Array.isArray(parsed.collections) ? parsed.collections : [];
    let environments: Environment[] = Array.isArray(parsed.environments) ? parsed.environments : [];

    // If no collections or environments are in storage, seed with default sample test collections & envs
    if (collections.length === 0) {
      collections = createSampleCollections();
    }
    if (environments.length === 0) {
      environments = createSampleEnvironments();
    }

    const activeEnvId =
      parsed.activeEnvId && environments.some((e) => e.id === parsed.activeEnvId)
        ? parsed.activeEnvId
        : environments[0]?.id ?? null;

    const history: HistoryEntry[] = Array.isArray(parsed.history)
      ? parsed.history.slice(0, 80)
      : [];

    const result: AppData = {
      collections,
      environments,
      activeEnvId,
      history,
    };

    return result;
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
