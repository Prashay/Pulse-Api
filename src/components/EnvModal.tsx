import { useRef } from "react";
import type { Environment } from "../types";
import { kv, uid } from "../id";
import { downloadJson, exportPostmanEnvironment } from "../importExport";
import { KeyValueEditor } from "./KeyValueEditor";

interface Props {
  environments: Environment[];
  activeEnvId: string | null;
  onChange: (envs: Environment[]) => void;
  onActive: (id: string | null) => void;
  onImportEnv: (file: File) => void;
  onClose: () => void;
}

export function EnvModal({
  environments,
  activeEnvId,
  onChange,
  onActive,
  onImportEnv,
  onClose,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Environments</h2>
        <p className="muted">
          Use {"{{variable}}"} in URLs, headers, params, body, and auth. Active environment is applied when sending.
          Import a Postman Environment JSON (`*_environment.json` or globals).
        </p>
        {environments.map((env) => (
          <div key={env.id} className="env-card">
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
            <KeyValueEditor
              rows={env.variables}
              onChange={(variables) => update(env.id, { variables })}
              keyPlaceholder="baseUrl"
              valuePlaceholder="https://api.example.com"
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
