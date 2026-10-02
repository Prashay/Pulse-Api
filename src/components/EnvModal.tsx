import { useEffect, useRef } from "react";
import type { Environment } from "../types";
import { kv, uid } from "../id";
import { downloadJson, exportPostmanEnvironment } from "../importExport";
import { KeyValueEditor } from "./KeyValueEditor";

interface Props {
  environments: Environment[];
  activeEnvId: string | null;
  targetEnvId?: string | null;
  targetVarKey?: string | null;
  onChange: (envs: Environment[]) => void;
  onActive: (id: string | null) => void;
  onImportEnv: (file: File) => void;
  onClose: () => void;
}

export function EnvModal({
  environments,
  activeEnvId,
  targetEnvId,
  targetVarKey,
  onChange,
  onActive,
  onImportEnv,
  onClose,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (targetEnvId) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`env-card-${targetEnvId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          if (targetVarKey) {
            const varInput = el.querySelector<HTMLInputElement>(`input[data-varkey="${targetVarKey}"]`);
            if (varInput) {
              varInput.focus();
              varInput.select();
              return;
            }
          }
          const input = el.querySelector("input");
          input?.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [targetEnvId, targetVarKey]);

  const add = () => {
    const env: Environment = { id: uid("env"), name: "New Environment", variables: [] };
    onChange([...environments, env]);
    onActive(env.id);
  };

  const addSampleEnv = () => {
    const sampleIndex = environments.length + 1;
    const sample: Environment = {
      id: uid("env"),
      name: `Sample Environment ${sampleIndex}`,
      variables: [
        kv("baseUrl", "http://127.0.0.1:3001"),
        kv("apiKey", "pulse_sample_key_9981"),
        kv("environment", "development"),
        kv("port", "3001"),
        kv("timeout", "5000"),
      ],
    };
    onChange([...environments, sample]);
    onActive(sample.id);
  };

  const update = (id: string, patch: Partial<Environment>) => {
    onChange(environments.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const remove = (id: string) => {
    const next = environments.filter((e) => e.id !== id);
    onChange(next);
    if (activeEnvId === id) onActive(next[0]?.id ?? null);
  };

  const duplicate = (id: string) => {
    const env = environments.find((e) => e.id === id);
    if (!env) return;
    const dup: Environment = {
      id: uid("env"),
      name: `${env.name} Copy`,
      variables: env.variables.map((v) => ({ ...v, id: uid("kv") })),
    };
    const idx = environments.findIndex((e) => e.id === id);
    const next = [...environments];
    next.splice(idx + 1, 0, dup);
    onChange(next);
    onActive(dup.id);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Environments</h2>
        <p className="muted">
          Use {"{{variable}}"} in URLs, headers, params, body, and auth. Active environment is applied when sending.
          Import a Postman Environment JSON (`*_environment.json` or globals).
        </p>
        {environments.map((env) => (
          <div
            key={env.id}
            id={`env-card-${env.id}`}
            className="env-card"
            style={
              targetEnvId === env.id
                ? {
                    borderColor: "var(--accent)",
                    boxShadow: "0 0 0 2px var(--accent-soft), 0 4px 16px rgba(59, 130, 246, 0.25)",
                  }
                : undefined
            }
          >
            <h3>
              <input
                value={env.name}
                onChange={(e) => update(env.id, { name: e.target.value })}
                style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 4, padding: "4px 8px" }}
              />
              <button
                className={`btn sm ${activeEnvId === env.id ? "primary" : ""}`}
                onClick={() => onActive(env.id)}
              >
                {activeEnvId === env.id ? "Active" : "Use"}
              </button>
              <button
                className="btn sm"
                onClick={() => duplicate(env.id)}
                title="Duplicate this environment"
              >
                Duplicate
              </button>
              <button
                className="btn sm"
                onClick={() =>
                  downloadJson(
                    `${env.name.replace(/\s+/g, "-").toLowerCase()}.postman_environment.json`,
                    exportPostmanEnvironment(env)
                  )
                }
              >
                Export
              </button>
              <button className="btn sm danger" onClick={() => remove(env.id)}>
                Delete
              </button>
            </h3>

            {/* Dedicated Base URL Quick Editor Box */}
            <div className={`env-baseurl-quick-box ${targetVarKey === "baseUrl" ? "highlight-active" : ""}`}>
              <div className="env-baseurl-label-row">
                <span className="env-baseurl-tag">
                  <span className="dot" />
                  <strong>Base URL</strong> (<code>{"{{baseUrl}}"}</code>)
                </span>
                <span className="env-baseurl-hint">Target host for local mock server or external APIs</span>
              </div>
              <div className="env-baseurl-input-row">
                <input
                  type="text"
                  data-varkey="baseUrl"
                  className="env-baseurl-input"
                  placeholder="e.g. http://127.0.0.1:3001 or http://localhost:8080"
                  value={env.variables.find((v) => v.key === "baseUrl")?.value ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    const exists = env.variables.some((v) => v.key === "baseUrl");
                    const updated = exists
                      ? env.variables.map((v) => (v.key === "baseUrl" ? { ...v, value: val, enabled: true } : v))
                      : [kv("baseUrl", val), ...env.variables];
                    update(env.id, { variables: updated });
                  }}
                />
              </div>
              <div className="env-baseurl-presets">
                <span className="preset-text">Quick Presets:</span>
                <button
                  type="button"
                  className="preset-btn"
                  onClick={() => {
                    const exists = env.variables.some((v) => v.key === "baseUrl");
                    const updated = exists
                      ? env.variables.map((v) => (v.key === "baseUrl" ? { ...v, value: "http://127.0.0.1:3001", enabled: true } : v))
                      : [kv("baseUrl", "http://127.0.0.1:3001"), ...env.variables];
                    update(env.id, { variables: updated });
                  }}
                  title="Pulse Built-in Proxy & Mock Server"
                >
                  ⚡ Local Mock (3001)
                </button>
                <button
                  type="button"
                  className="preset-btn"
                  onClick={() => {
                    const exists = env.variables.some((v) => v.key === "baseUrl");
                    const updated = exists
                      ? env.variables.map((v) => (v.key === "baseUrl" ? { ...v, value: "http://localhost:8080", enabled: true } : v))
                      : [kv("baseUrl", "http://localhost:8080"), ...env.variables];
                    update(env.id, { variables: updated });
                  }}
                  title="Standard Local Backend Port 8080"
                >
                  💻 localhost:8080
                </button>
                <button
                  type="button"
                  className="preset-btn"
                  onClick={() => {
                    const exists = env.variables.some((v) => v.key === "baseUrl");
                    const updated = exists
                      ? env.variables.map((v) => (v.key === "baseUrl" ? { ...v, value: "http://localhost:3000", enabled: true } : v))
                      : [kv("baseUrl", "http://localhost:3000"), ...env.variables];
                    update(env.id, { variables: updated });
                  }}
                  title="Node / React / Next.js Port 3000"
                >
                  🚀 localhost:3000
                </button>
                <button
                  type="button"
                  className="preset-btn"
                  onClick={() => {
                    const exists = env.variables.some((v) => v.key === "baseUrl");
                    const updated = exists
                      ? env.variables.map((v) => (v.key === "baseUrl" ? { ...v, value: "https://httpbin.org", enabled: true } : v))
                      : [kv("baseUrl", "https://httpbin.org"), ...env.variables];
                    update(env.id, { variables: updated });
                  }}
                  title="Public HTTPBin Echo API"
                >
                  🌐 httpbin.org
                </button>
              </div>
            </div>

            <KeyValueEditor
              rows={env.variables}
              onChange={(variables) => update(env.id, { variables })}
              keyPlaceholder="baseUrl"
              valuePlaceholder="https://api.example.com"
              title="All Environment Variables"
              allowBulkEdit={true}
            />
            {env.variables.length === 0 && (
              <button
                className="btn sm ghost"
                onClick={() => update(env.id, { variables: [kv("baseUrl", "https://api.example.com")] })}
              >
                Add sample variable
              </button>
            )}
          </div>
        ))}
        {environments.length === 0 && (
          <div style={{ textAlign: "center", padding: "28px 0", color: "var(--muted)" }}>
            <p style={{ marginBottom: 12 }}>No environments configured yet.</p>
            <button
              className="btn primary sm"
              onClick={addSampleEnv}
            >
              🧪 Create Sample Environment
            </button>
          </div>
        )}
        <div className="modal-actions">
          <input
            ref={fileRef}
            className="hidden-file"
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImportEnv(file);
              e.target.value = "";
            }}
          />
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import env file
          </button>
          <button
            className="btn"
            onClick={addSampleEnv}
            title="Add pre-configured sample environment with baseUrl, apiKey, and timeout"
          >
            🧪 Add Sample Env
          </button>
          <button className="btn" onClick={add}>
            New environment
          </button>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
