import type { AppData, Collection, Environment, HistoryEntry } from "./types";

const KEY = "pulse-api-studio-v1";

const TEST_COLLECTION_NAMES = new Set([
  "local test suite",
  "httpbin sandbox",
]);

const TEST_ENV_NAMES = new Set([
  "localhost (3001)",
  "localhost (3000)",
  "localhost 3000",
  "localhost 3001",
  "localhost:3000",
  "localhost:3001",
  "local host 3000",
  "local host 3001",
  "remote sandbox",
  "httpbin sandbox",
]);

function isTestCollection(name?: string): boolean {
  if (!name) return false;
  return TEST_COLLECTION_NAMES.has(name.trim().toLowerCase());
}

function isTestEnvironment(name?: string): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return (
    TEST_ENV_NAMES.has(n) ||
    n.startsWith("localhost (300") ||
    n.startsWith("local host 300") ||
    n === "remote sandbox" ||
    n === "httpbin sandbox"
  );
}

export function defaultData(): AppData {
  return {
    collections: [],
    environments: [],
    activeEnvId: null,
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

    const collections: Collection[] = Array.isArray(parsed.collections)
      ? parsed.collections.filter((c) => c && c.name && !isTestCollection(c.name))
      : [];

    const environments: Environment[] = Array.isArray(parsed.environments)
      ? parsed.environments.filter((e) => e && e.name && !isTestEnvironment(e.name))
      : [];

    const activeEnvId =
      parsed.activeEnvId && environments.some((e) => e.id === parsed.activeEnvId)
        ? parsed.activeEnvId
        : environments[0]?.id ?? null;

    const history: HistoryEntry[] = Array.isArray(parsed.history)
      ? parsed.history.slice(0, 80)
      : [];

    const cleanData: AppData = {
      collections,
      environments,
      activeEnvId,
      history,
    };

    // If test collections or environments were filtered out from raw data, save the cleaned state
    if (
      (Array.isArray(parsed.collections) && parsed.collections.length !== collections.length) ||
      (Array.isArray(parsed.environments) && parsed.environments.length !== environments.length)
    ) {
      saveData(cleanData);
    }

    return cleanData;
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
