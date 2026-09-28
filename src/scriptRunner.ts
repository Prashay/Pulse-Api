import type { Environment, KeyValue, ProxyResponse, RequestSnapshot, TestResult } from "./types";

export interface ScriptExecutionResult {
  updatedEnvVariables: KeyValue[];
  envModified: boolean;
  testResults: TestResult[];
  consoleLogs: { type: "log" | "info" | "warn" | "error"; message: string }[];
  mutatedRequest?: Partial<RequestSnapshot>;
  error?: string;
}

/**
 * Creates a Chai/Postman-like assertion library for tests:
 * pm.expect(x).to.equal(y)
 * pm.expect(x).to.be.a("string")
 * pm.expect(x).to.have.property("foo")
 */
function createExpect(actual: unknown) {
  let isNot = false;

  const assertion = {
    get not() {
      isNot = true;
      return assertion;
    },
    get to() {
      return assertion;
    },
    get be() {
      return assertion;
    },
    get have() {
      return assertion;
    },
    get that() {
      return assertion;
    },
    equal(expected: unknown) {
      const pass = actual === expected;
      if (isNot ? pass : !pass) {
        throw new Error(`expected ${JSON.stringify(actual)} to ${isNot ? "not " : ""}equal ${JSON.stringify(expected)}`);
      }
      return assertion;
    },
    eql(expected: unknown) {
      const pass = JSON.stringify(actual) === JSON.stringify(expected);
      if (isNot ? pass : !pass) {
        throw new Error(`expected ${JSON.stringify(actual)} to ${isNot ? "not " : ""}deeply equal ${JSON.stringify(expected)}`);
      }
      return assertion;
    },
    a(typeString: string) {
      let pass = false;
      if (typeString === "array") pass = Array.isArray(actual);
      else if (typeString === "null") pass = actual === null;
      else pass = typeof actual === typeString;
      if (isNot ? pass : !pass) {
        throw new Error(`expected ${JSON.stringify(actual)} to ${isNot ? "not " : ""}be a ${typeString}`);
      }
      return assertion;
    },
    an(typeString: string) {
      return assertion.a(typeString);
    },
    property(propName: string, propVal?: unknown) {
      const pass = actual != null && typeof actual === "object" && propName in (actual as object);
      if (isNot ? pass : !pass) {
        throw new Error(`expected object to ${isNot ? "not " : ""}have property '${propName}'`);
      }
      if (propVal !== undefined) {
        const val = (actual as Record<string, unknown>)[propName];
        if (JSON.stringify(val) !== JSON.stringify(propVal)) {
          throw new Error(`expected property '${propName}' to equal ${JSON.stringify(propVal)} but got ${JSON.stringify(val)}`);
        }
      }
      return assertion;
    },
    include(item: unknown) {
      let pass = false;
      if (typeof actual === "string" && typeof item === "string") {
        pass = actual.includes(item);
      } else if (Array.isArray(actual)) {
        pass = actual.includes(item);
      } else if (actual != null && typeof actual === "object") {
        pass = String(item) in (actual as object);
      }
      if (isNot ? pass : !pass) {
        throw new Error(`expected ${JSON.stringify(actual)} to ${isNot ? "not " : ""}include ${JSON.stringify(item)}`);
      }
      return assertion;
    },
    contain(item: unknown) {
      return assertion.include(item);
    },
    above(num: number) {
      const pass = Number(actual) > num;
      if (isNot ? pass : !pass) {
        throw new Error(`expected ${actual} to be above ${num}`);
      }
      return assertion;
    },
    below(num: number) {
      const pass = Number(actual) < num;
      if (isNot ? pass : !pass) {
        throw new Error(`expected ${actual} to be below ${num}`);
      }
      return assertion;
    },
    atLeast(num: number) {
      const pass = Number(actual) >= num;
      if (isNot ? pass : !pass) {
        throw new Error(`expected ${actual} to be at least ${num}`);
      }
      return assertion;
    },
    atMost(num: number) {
      const pass = Number(actual) <= num;
      if (isNot ? pass : !pass) {
        throw new Error(`expected ${actual} to be at most ${num}`);
      }
      return assertion;
    },
    get true() {
      const pass = actual === true;
      if (isNot ? pass : !pass) throw new Error(`expected ${actual} to be true`);
      return assertion;
    },
    get false() {
      const pass = actual === false;
      if (isNot ? pass : !pass) throw new Error(`expected ${actual} to be false`);
      return assertion;
    },
    get null() {
      const pass = actual === null;
      if (isNot ? pass : !pass) throw new Error(`expected ${actual} to be null`);
      return assertion;
    },
    get undefined() {
      const pass = actual === undefined;
      if (isNot ? pass : !pass) throw new Error(`expected ${actual} to be undefined`);
      return assertion;
    },
    get ok() {
      const pass = Boolean(actual);
      if (isNot ? pass : !pass) throw new Error(`expected ${actual} to be truthy`);
      return assertion;
    },
  };

  return assertion;
}

/**
 * Runs a pre-request script or post-response (test) script in a sandboxed execution context.
 */
export async function runScript(
  type: "pre" | "post",
  code: string,
  env: Environment | null,
  req: RequestSnapshot,
  resp?: ProxyResponse | null
): Promise<ScriptExecutionResult> {
  const result: ScriptExecutionResult = {
    updatedEnvVariables: env ? [...env.variables] : [],
    envModified: false,
    testResults: [],
    consoleLogs: [],
  };

  if (!code || !code.trim()) {
    return result;
  }

  // Work with a mutable copy of environment variables
  const envMap = new Map<string, string>();
  if (env && Array.isArray(env.variables)) {
    for (const v of env.variables) {
      if (v.key) envMap.set(v.key.trim(), String(v.value ?? ""));
    }
  }

  // Variables map (local variables scoped to execution)
  const varMap = new Map<string, string>(envMap);

  const envObj = {
    get: (key: string) => envMap.get(String(key).trim()),
    set: (key: string, value: unknown) => {
      const k = String(key).trim();
      const val = value != null ? (typeof value === "object" ? JSON.stringify(value) : String(value)) : "";
      envMap.set(k, val);
      result.envModified = true;
    },
    has: (key: string) => envMap.has(String(key).trim()),
    unset: (key: string) => {
      const k = String(key).trim();
      if (envMap.has(k)) {
        envMap.delete(k);
        result.envModified = true;
      }
    },
    toObject: () => Object.fromEntries(envMap.entries()),
  };

  const variablesObj = {
    get: (key: string) => varMap.get(String(key).trim()),
    set: (key: string, value: unknown) => {
      const k = String(key).trim();
      const val = value != null ? (typeof value === "object" ? JSON.stringify(value) : String(value)) : "";
      varMap.set(k, val);
    },
    has: (key: string) => varMap.has(String(key).trim()),
  };

  // Scoped console that routes to our result logs
  const scopedConsole = {
    log: (...args: unknown[]) => {
      result.consoleLogs.push({ type: "log", message: args.map(formatLogArg).join(" ") });
    },
    info: (...args: unknown[]) => {
      result.consoleLogs.push({ type: "info", message: args.map(formatLogArg).join(" ") });
    },
    warn: (...args: unknown[]) => {
      result.consoleLogs.push({ type: "warn", message: args.map(formatLogArg).join(" ") });
    },
    error: (...args: unknown[]) => {
      result.consoleLogs.push({ type: "error", message: args.map(formatLogArg).join(" ") });
    },
  };

  // Request proxy object
  const reqHeadersCopy = [...req.headers];
  const reqObj = {
    url: req.url,
    method: req.method,
    body: req.body,
    headers: {
      add: (headerOrKey: { key: string; value: string } | string, val?: string) => {
        if (typeof headerOrKey === "string") {
          reqHeadersCopy.push({ id: `h_${Date.now()}`, key: headerOrKey, value: String(val ?? ""), enabled: true });
        } else if (headerOrKey && headerOrKey.key) {
          reqHeadersCopy.push({ id: `h_${Date.now()}`, key: headerOrKey.key, value: String(headerOrKey.value ?? ""), enabled: true });
        }
        result.mutatedRequest = { ...result.mutatedRequest, headers: reqHeadersCopy };
      },
      upsert: (header: { key: string; value: string }) => {
        const idx = reqHeadersCopy.findIndex((h) => h.key.toLowerCase() === header.key.toLowerCase());
        if (idx >= 0) {
          reqHeadersCopy[idx].value = String(header.value ?? "");
          reqHeadersCopy[idx].enabled = true;
        } else {
          reqHeadersCopy.push({ id: `h_${Date.now()}`, key: header.key, value: String(header.value ?? ""), enabled: true });
        }
        result.mutatedRequest = { ...result.mutatedRequest, headers: reqHeadersCopy };
      },
      get: (key: string) => {
        const hit = reqHeadersCopy.find((h) => h.key.toLowerCase() === key.toLowerCase());
        return hit ? hit.value : undefined;
      },
    },
  };

  // Response object for post-response scripts
  let parsedJsonBody: unknown = null;
  let jsonParsed = false;

  const respObj = resp
    ? {
        code: resp.status,
        status: resp.statusText,
        responseTime: resp.time,
        responseSize: resp.size,
        headers: {
          get: (name: string) => {
            const lower = name.toLowerCase();
            for (const [k, v] of Object.entries(resp.headers)) {
              if (k.toLowerCase() === lower) return v;
            }
            return undefined;
          },
        },
        text: () => resp.body,
        json: () => {
          if (!jsonParsed) {
            try {
              parsedJsonBody = JSON.parse(resp.body);
            } catch {
              throw new Error(`Response body is not valid JSON`);
            }
            jsonParsed = true;
          }
          return parsedJsonBody;
        },
        to: {
          have: {
            status: (code: number) => {
              if (resp.status !== code) {
                throw new Error(`expected response status code to be ${code} but got ${resp.status}`);
              }
            },
            header: (name: string, value?: string) => {
              const val = respObj?.headers.get(name);
              if (val === undefined) {
                throw new Error(`expected response to have header '${name}'`);
              }
              if (value !== undefined && val !== value) {
                throw new Error(`expected header '${name}' to equal '${value}' but got '${val}'`);
              }
            },
          },
          be: {
            get ok() {
              if (!resp.ok) throw new Error(`expected response to be ok (2xx), but status was ${resp.status}`);
              return true;
            },
            get success() {
              if (resp.status < 200 || resp.status >= 300) {
                throw new Error(`expected response code 2xx, got ${resp.status}`);
              }
              return true;
            },
            get error() {
              if (resp.status < 400) {
                throw new Error(`expected error status code (4xx/5xx), got ${resp.status}`);
              }
              return true;
            },
          },
        },
      }
    : null;

  // Postman `pm` context object
  const pm = {
    environment: envObj,
    variables: variablesObj,
    collectionVariables: envObj,
    request: reqObj,
    response: respObj,
    info: {
      requestName: req.name,
      eventName: type === "pre" ? "prerequest" : "test",
    },
    expect: createExpect,
    test: (testName: string, testFn: () => void | Promise<void>) => {
      try {
        const testRes = testFn();
        if (testRes && typeof (testRes as Promise<unknown>).then === "function") {
          // In case test function is async
          (testRes as Promise<void>)
            .then(() => {
              result.testResults.push({ name: testName, passed: true });
            })
            .catch((err) => {
              result.testResults.push({
                name: testName,
                passed: false,
                error: err instanceof Error ? err.message : String(err),
              });
            });
        } else {
          result.testResults.push({ name: testName, passed: true });
        }
      } catch (err) {
        result.testResults.push({
          name: testName,
          passed: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };

  try {
    // Execute user script in safe sandboxed function wrapper
    const runner = new Function("pm", "pulse", "console", "expect", `"use strict";\n${code}`);
    const maybePromise = runner(pm, pm, scopedConsole, createExpect);
    if (maybePromise && typeof maybePromise.then === "function") {
      await maybePromise;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = msg;
    result.consoleLogs.push({ type: "error", message: `Script error: ${msg}` });
  }

  // If environment was modified, sync updated KeyValue list
  if (result.envModified && env) {
    const updated: KeyValue[] = [];
    // Keep existing rows with updated values
    for (const v of env.variables) {
      if (envMap.has(v.key)) {
        updated.push({ ...v, value: envMap.get(v.key)! });
        envMap.delete(v.key);
      } else {
        // Was unset
      }
    }
    // Add any newly created variables from pm.environment.set()
    for (const [newKey, newVal] of envMap.entries()) {
      updated.push({
        id: `var_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        key: newKey,
        value: newVal,
        enabled: true,
      });
    }
    result.updatedEnvVariables = updated;
  }

  return result;
}

function formatLogArg(arg: unknown): string {
  if (arg == null) return String(arg);
  if (typeof arg === "string") return arg;
  if (typeof arg === "number" || typeof arg === "boolean") return String(arg);
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}
