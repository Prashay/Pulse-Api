import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthConfig, BodyMode, Collection, Environment, HttpMethod, RequestSnapshot } from "../types";
import { METHODS, METHOD_COLORS } from "../types";
import { KeyValueEditor } from "./KeyValueEditor";
import { extractVariables, interpolate, lookupVariable } from "../request";
import { parseCurl } from "../curl";

export type ReqTab = "params" | "auth" | "headers" | "body" | "scripts";

interface WsMessage {
  id: string;
  direction: "sent" | "recv";
  data: string;
  time: string;
}

interface Props {
  draft: RequestSnapshot;
  sending: boolean;
  reqTab: ReqTab;
  envName: string | null;
  env?: Environment | null;
  environments?: Environment[];
  onSelectEnv?: (id: string | null) => void;
  onUpdateEnvVariable?: (varKey: string, newValue: string, targetEnvId?: string | null) => void;
  onManageEnv?: (envId?: string | null, targetVarKey?: string) => void;
  collection?: Collection | null;
  onEditCollection?: (id: string, initialTab?: "scripts-pre" | "scripts-post" | "variables" | "overview") => void;
  onReqTab: (t: ReqTab) => void;
  onChange: (patch: Partial<RequestSnapshot>) => void;
  onSend: () => void;
}

export function RequestPane(props: Props) {
  const { draft, env, collection } = props;

  const [editingVar, setEditingVar] = useState<string | null>(null);
  const [editVarValue, setEditVarValue] = useState<string>("");
  const [editTargetEnvId, setEditTargetEnvId] = useState<string | null>(env?.id ?? null);
  const [savedFlash, setSavedFlash] = useState<boolean>(false);
  const varInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (env?.id && !editTargetEnvId) {
      setEditTargetEnvId(env.id);
    }
  }, [env?.id]);

  const isWebSocket =
    draft.method === "WS" ||
    draft.url.trim().startsWith("ws://") ||
    draft.url.trim().startsWith("wss://");

  const [wsStatus, setWsStatus] = useState<"disconnected" | "connecting" | "connected" | "error">(
    "disconnected"
  );
  const [wsMessages, setWsMessages] = useState<WsMessage[]>([]);
  const [wsInput, setWsInput] = useState<string>('{\n  "event": "ping",\n  "timestamp": ' + Date.now() + '\n}');
  const [wsError, setWsError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Scripts sub-tab: "pre" (Before request) vs "post" (After response / Tests)
  const [scriptSubTab, setScriptSubTab] = useState<"pre" | "post">("pre");

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const [beautifyStatus, setBeautifyStatus] = useState<"idle" | "success" | "error">("idle");

  const handleBeautifyJson = () => {
    if (!draft.body || !draft.body.trim()) return;
    try {
      const parsed = JSON.parse(draft.body);
      const pretty = JSON.stringify(parsed, null, 2);
      props.onChange({ body: pretty, bodyMode: "json" });
      setBeautifyStatus("success");
      setTimeout(() => setBeautifyStatus("idle"), 1600);
    } catch {
      setBeautifyStatus("error");
      setTimeout(() => setBeautifyStatus("idle"), 2200);
    }
  };

  const setAuth = (patch: Partial<AuthConfig>) =>
    props.onChange({ auth: { ...draft.auth, ...patch } });

  const resolvedUrl = useMemo(
    () => interpolate(draft.url, env ?? null, collection ?? null),
    [draft.url, env, collection]
  );

  const detectedUrlVars = useMemo(() => extractVariables(draft.url), [draft.url]);

  // Detected variables across other tabs for live resolution feedback:
  const headerVars = useMemo(() => {
    const list: string[] = [];
    for (const h of draft.headers) {
      if (h.enabled !== false) {
        list.push(...extractVariables(h.key), ...extractVariables(h.value));
      }
    }
    return Array.from(new Set(list));
  }, [draft.headers]);

  const authVars = useMemo(() => {
    const list: string[] = [];
    if (draft.auth.bearerToken) list.push(...extractVariables(draft.auth.bearerToken));
    if (draft.auth.basicUser) list.push(...extractVariables(draft.auth.basicUser));
    if (draft.auth.basicPass) list.push(...extractVariables(draft.auth.basicPass));
    if (draft.auth.apiKeyName) list.push(...extractVariables(draft.auth.apiKeyName));
    if (draft.auth.apiKeyValue) list.push(...extractVariables(draft.auth.apiKeyValue));
    return Array.from(new Set(list));
  }, [draft.auth]);

  const bodyVars = useMemo(() => {
    if (!draft.body) return [];
    return extractVariables(draft.body);
  }, [draft.body]);

  const handleWsConnect = () => {
    if (wsStatus === "connected" || wsStatus === "connecting") {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsStatus("disconnected");
      return;
    }

    const targetUrl = resolvedUrl.trim();
    if (!targetUrl) {
      alert("Please provide a valid WebSocket URL (e.g., wss://echo.websocket.org)");
      return;
    }

    setWsStatus("connecting");
    setWsError(null);

    try {
      const ws = new WebSocket(targetUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("connected");
        setWsMessages((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            direction: "recv",
            data: `[Connected to ${targetUrl}]`,
            time: new Date().toLocaleTimeString(),
          },
        ]);
      };

      ws.onmessage = (event) => {
        setWsMessages((prev) => [
          ...prev,
          {
            id: String(Date.now() + Math.random()),
            direction: "recv",
            data: typeof event.data === "string" ? event.data : "[Binary frame]",
            time: new Date().toLocaleTimeString(),
          },
        ]);
      };

      ws.onerror = () => {
        setWsStatus("error");
        setWsError("WebSocket connection encountered an error");
      };

      ws.onclose = () => {
        setWsStatus("disconnected");
        setWsMessages((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            direction: "recv",
            data: "[Connection closed]",
            time: new Date().toLocaleTimeString(),
          },
        ]);
      };
    } catch (e) {
      setWsStatus("error");
      setWsError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleWsSend = () => {
    if (!wsRef.current || wsStatus !== "connected") return;
    try {
      wsRef.current.send(wsInput);
      setWsMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          direction: "sent",
          data: wsInput,
          time: new Date().toLocaleTimeString(),
        },
      ]);
    } catch (e) {
      alert("Failed to send: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleOpenVarEditor = (varName: string) => {
    const currentEnv =
      (props.environments || []).find((e) => e.id === (editTargetEnvId || env?.id)) ||
      env ||
      props.environments?.[0];
    const existing = currentEnv?.variables.find((v) => v.key === varName);
    setEditingVar(varName);
    setEditVarValue(existing ? existing.value : "");
    setEditTargetEnvId(currentEnv?.id ?? null);
    setTimeout(() => {
      varInputRef.current?.focus();
      varInputRef.current?.select();
    }, 60);
  };

  const handleSaveVar = (explicitVal?: string) => {
    if (!editingVar) return;
    const valToSave = (explicitVal !== undefined ? explicitVal : editVarValue).trim();
    props.onUpdateEnvVariable?.(editingVar, valToSave, editTargetEnvId || env?.id);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const baseUrlHit = useMemo(() => {
    return lookupVariable("baseUrl", env ?? null, collection ?? null);
  }, [env, collection]);
  const hasBaseUrlInUrl = detectedUrlVars.includes("baseUrl");

  // Helper to render live variable pills in any tab
  const renderVariableChips = (vars: string[]) => {
    if (vars.length === 0) return null;
    return (
      <div className="tab-variables-bar">
        <span className="tab-var-label">
          <span className="var-indicator-dot" />
          <span>Resolved Variables:</span>
        </span>
        <div className="res-vars-pills">
          {vars.map((v) => {
            const hit = lookupVariable(v, env ?? null, collection ?? null);
            const isEditingThis = editingVar === v;
            if (!hit) {
              return (
                <span
                  key={v}
                  className={`res-var-chip missing interactive ${isEditingThis ? "chip-active" : ""}`}
                  title={`Variable not defined in active environment (${env?.name || "No Environment"}). Click to define it.`}
                  onClick={() => handleOpenVarEditor(v)}
                >
                  ⚠️ {`{{${v}}}`} <span className="chip-missing-tag">+ Set</span>
                </span>
              );
            }

            const isDynamic = hit.source === "dynamic";
            return (
              <span
                key={v}
                className={`res-var-chip ok interactive ${isDynamic ? "dynamic-var-chip" : ""} ${isEditingThis ? "chip-active" : ""}`}
                title={
                  isDynamic
                    ? `Dynamic Postman variable: generates a random ${hit.value} on each send`
                    : `From ${hit.sourceName}: ${v} = ${hit.value}. Click to edit.`
                }
                onClick={() => !isDynamic && handleOpenVarEditor(v)}
              >
                <span className="chip-key">{`{{${v}}}`}</span>
                <span className="chip-arrow">→</span>
                <span className="chip-val">{isDynamic ? `🎲 ${hit.value}` : (hit.value || '""')}</span>
                {!isDynamic && <span className="chip-edit-icon" title="Edit variable">✏️</span>}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  // Snippet inserters for scripts
  const insertSnippet = (snippetCode: string) => {
    const currentCode =
      scriptSubTab === "pre" ? draft.preScript || "" : draft.postScript || "";
    const updated = currentCode ? `${currentCode.trimEnd()}\n\n${snippetCode}` : snippetCode;
    if (scriptSubTab === "pre") {
      props.onChange({ preScript: updated });
    } else {
      props.onChange({ postScript: updated });
    }
  };

  const hasPreScript = Boolean(draft.preScript && draft.preScript.trim());
  const hasPostScript = Boolean(draft.postScript && draft.postScript.trim());

  return (
    <div className="pane request-pane">
      <div className="urlbar url-bar">
        <div className="url-input-group">
          <select
            className={`method-select ${METHOD_COLORS[draft.method]}`}
            value={draft.method}
            onChange={(e) => props.onChange({ method: e.target.value as HttpMethod })}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            className="url-input"
            placeholder="https://api.example.com/v1/users or paste cURL request..."
            value={draft.url}
            onChange={(e) => {
              const val = e.target.value;
              if (val.trim().toLowerCase().startsWith("curl ")) {
                try {
                  const parsed = parseCurl(val);
                  props.onChange({
                    method: parsed.method,
                    url: parsed.url,
                    params: parsed.params,
                    headers: parsed.headers,
                    bodyMode: parsed.bodyMode,
                    body: parsed.body,
                    auth: parsed.auth,
                  });
                  return;
                } catch {
                  // Ignore incomplete curl while typing
                }
              }
              props.onChange({ url: val });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (isWebSocket) handleWsConnect();
                else props.onSend();
              }
            }}
          />
          {hasBaseUrlInUrl && (
            <button
              type="button"
              className={`url-baseurl-quick-tag ${editingVar === "baseUrl" ? "active" : ""}`}
              onClick={() => {
                if (editingVar === "baseUrl") setEditingVar(null);
                else handleOpenVarEditor("baseUrl");
              }}
              title={`baseUrl is provided by ${baseUrlHit?.sourceName || env?.name || "environment"}. Click to edit.`}
            >
              <span className="base-tag-icon">🌐</span>
              <span className="base-tag-label">baseUrl:</span>
              <span className="base-tag-val">{baseUrlHit?.value || "unresolved"}</span>
              <span className="base-tag-pencil">✏️</span>
            </button>
          )}
        </div>
        {isWebSocket ? (
          <button
            className={`send-btn ${wsStatus === "connected" ? "danger" : ""}`}
            style={{
              background:
                wsStatus === "connected"
                  ? "#ef4444"
                  : wsStatus === "connecting"
                    ? "#f59e0b"
                    : "#10b981",
              minWidth: 100,
            }}
            onClick={handleWsConnect}
          >
            {wsStatus === "connected"
              ? "Disconnect"
              : wsStatus === "connecting"
                ? "Connecting..."
                : "Connect"}
          </button>
        ) : (
          <button
            className="send-btn"
            disabled={props.sending}
            onClick={props.onSend}
          >
            {props.sending ? "Sending..." : "Send"}
          </button>
        )}
      </div>

      {/* Target URL Resolution Bar */}
      {detectedUrlVars.length > 0 && (
        <div className="url-resolution-bar">
          <div className="res-badge">
            <span className="res-dot" />
            <span>RESOLVED URL:</span>
          </div>
          <span className="res-url" title={resolvedUrl}>
            {resolvedUrl}
          </span>

          {/* Quick Edit baseUrl Button */}
          {hasBaseUrlInUrl && (
            <button
              type="button"
              className={`res-edit-base-btn ${editingVar === "baseUrl" ? "active" : ""}`}
              onClick={() => {
                if (editingVar === "baseUrl") setEditingVar(null);
                else handleOpenVarEditor("baseUrl");
              }}
              title={
                baseUrlHit
                  ? `Click to edit baseUrl (${baseUrlHit.value}) in ${baseUrlHit.sourceName}`
                  : `baseUrl is not set in active env (${env?.name || "No Environment"}). Click to define it.`
              }
            >
              <span className="res-edit-pencil">✏️</span>
              <span className="res-edit-title">Edit baseUrl</span>
              {baseUrlHit ? (
                <span className="res-edit-current-val">{baseUrlHit.value}</span>
              ) : (
                <span className="res-edit-unresolved-tag">not set</span>
              )}
            </button>
          )}

          <div className="res-vars-pills">
            {detectedUrlVars.map((v) => {
              const hit = lookupVariable(v, env ?? null, collection ?? null);
              const isEditingThis = editingVar === v;
              return hit ? (
                <span
                  key={v}
                  className={`res-var-chip ok interactive ${isEditingThis ? "chip-active" : ""}`}
                  title={`From ${hit.sourceName}: ${v} = ${hit.value}. Click to edit.`}
                  onClick={() => handleOpenVarEditor(v)}
                >
                  <span className="chip-key">{`{{${v}}}`}</span>
                  <span className="chip-arrow">→</span>
                  <span className="chip-val">{hit.value || '""'}</span>
                  <span className="chip-edit-icon" title="Edit variable">✏️</span>
                </span>
              ) : (
                <span
                  key={v}
                  className={`res-var-chip missing interactive ${isEditingThis ? "chip-active" : ""}`}
                  title={`Missing in active environment (${env?.name || "none"}). Click to define it.`}
                  onClick={() => handleOpenVarEditor(v)}
                >
                  ⚠️ {`{{${v}}}`} <span className="chip-missing-tag">+ Set</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Variable Editor Drawer */}
      {editingVar && (
        <div className="var-quick-editor-box">
          <div className="var-quick-editor-header">
            <div className="var-header-left">
              <span className="var-icon">🌐</span>
              <span className="var-title">
                Edit Variable: <code>{`{{${editingVar}}}`}</code>
              </span>
              {env ? (
                <span className="var-env-badge ok">
                  Env: <strong>{env.name}</strong>
                </span>
              ) : (
                <span className="var-env-badge warn">⚠️ No Environment Active</span>
              )}
            </div>
            <div className="var-header-right">
              {props.environments && props.environments.length > 0 && (
                <div className="var-env-select-wrap">
                  <span className="var-env-select-label">Target Env:</span>
                  <select
                    className="var-env-switcher"
                    value={editTargetEnvId || env?.id || ""}
                    onChange={(e) => {
                      const newEnvId = e.target.value || null;
                      setEditTargetEnvId(newEnvId);
                      if (newEnvId) {
                        props.onSelectEnv?.(newEnvId);
                        const targetE = props.environments?.find((envItem) => envItem.id === newEnvId);
                        const vObj = targetE?.variables.find((v) => v.key === editingVar);
                        if (vObj) setEditVarValue(vObj.value);
                      }
                    }}
                    title="Change target environment"
                  >
                    {props.environments.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                className="var-close-btn"
                onClick={() => setEditingVar(null)}
                aria-label="Close editor"
                title="Close (Esc)"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="var-quick-editor-body">
            <div className="var-input-row">
              <label className="var-input-label">{editingVar} value:</label>
              <div className="var-input-wrapper">
                <input
                  ref={varInputRef}
                  type="text"
                  className="var-value-input"
                  value={editVarValue}
                  placeholder={
                    editingVar === "baseUrl"
                      ? "e.g. http://127.0.0.1:3001 or http://localhost:8080"
                      : `Enter value for ${editingVar}...`
                  }
                  onChange={(e) => setEditVarValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveVar();
                    if (e.key === "Escape") setEditingVar(null);
                  }}
                />
                {editVarValue && (
                  <button
                    type="button"
                    className="var-clear-input"
                    onClick={() => setEditVarValue("")}
                    title="Clear"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="button"
                className="btn primary var-save-btn"
                onClick={() => handleSaveVar()}
              >
                {savedFlash ? "✓ Saved!" : "Save & Apply"}
              </button>
            </div>

            {editingVar === "baseUrl" && (
              <div className="var-presets-row">
                <span className="presets-label">⚡ 1-Click Base URL Presets:</span>
                <div className="presets-list">
                  <button
                    type="button"
                    className="preset-chip local"
                    onClick={() => {
                      setEditVarValue("http://127.0.0.1:3001");
                      handleSaveVar("http://127.0.0.1:3001");
                    }}
                    title="Pulse Built-in Proxy & Mock Server on port 3001"
                  >
                    ⚡ Pulse Local Mock (3001)
                  </button>
                  <button
                    type="button"
                    className="preset-chip"
                    onClick={() => {
                      setEditVarValue("http://localhost:8080");
                      handleSaveVar("http://localhost:8080");
                    }}
                    title="Common Local Backend on port 8080"
                  >
                    💻 localhost:8080
                  </button>
                  <button
                    type="button"
                    className="preset-chip"
                    onClick={() => {
                      setEditVarValue("http://localhost:3000");
                      handleSaveVar("http://localhost:3000");
                    }}
                    title="Node.js / React / Next.js on port 3000"
                  >
                    🚀 localhost:3000
                  </button>
                  <button
                    type="button"
                    className="preset-chip"
                    onClick={() => {
                      setEditVarValue("http://localhost:5000");
                      handleSaveVar("http://localhost:5000");
                    }}
                    title="Python Flask / .NET on port 5000"
                  >
                    🐍 localhost:5000
                  </button>
                  <button
                    type="button"
                    className="preset-chip"
                    onClick={() => {
                      setEditVarValue("https://httpbin.org");
                      handleSaveVar("https://httpbin.org");
                    }}
                    title="Public HTTPBin Echo Service"
                  >
                    🌐 httpbin.org
                  </button>
                  <button
                    type="button"
                    className="preset-chip"
                    onClick={() => {
                      setEditVarValue("https://jsonplaceholder.typicode.com");
                      handleSaveVar("https://jsonplaceholder.typicode.com");
                    }}
                    title="Public JSONPlaceholder Test API"
                  >
                    📦 jsonplaceholder
                  </button>
                </div>
              </div>
            )}

            <div className="var-quick-editor-footer">
              <span className="var-hint">
                💡 Updates <code>{`{{${editingVar}}}`}</code> in environment. URL previews and requests update immediately.
              </span>
              {props.onManageEnv && (
                <button
                  type="button"
                  className="btn ghost sm var-manage-all-btn"
                  onClick={() => {
                    setEditingVar(null);
                    props.onManageEnv?.(editTargetEnvId || env?.id || null, editingVar);
                  }}
                  title="Open full environment manager to view all variables, duplicate, or export"
                >
                  ⚙️ Open Full Environment Settings
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isWebSocket ? (
        <div className="ws-client-container">
          <div className="ws-status-bar">
            <div className="ws-status-indicator">
              <span className={`ws-dot ${wsStatus}`} />
              <span style={{ textTransform: "uppercase" }}>{wsStatus}</span>
              {wsStatus === "connected" && (
                <span style={{ color: "var(--text-mute)", fontWeight: "normal", marginLeft: 8 }}>
                  Active duplex connection
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
                Frames: {wsMessages.length}
              </span>
              {wsMessages.length > 0 && (
                <button
                  className="btn sm ghost"
                  onClick={() => setWsMessages([])}
                  title="Clear messages log"
                >
                  Clear Log
                </button>
              )}
            </div>
          </div>
          {wsError && <div className="ws-error-alert">{wsError}</div>}
          <div className="ws-main-split">
            <div className="ws-composer-pane">
              <div className="ws-pane-header">
                <span>Send Message / Frame</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    className="btn sm ghost"
                    style={{ fontSize: 10, padding: "2px 6px" }}
                    onClick={() =>
                      setWsInput(
                        JSON.stringify(
                          { event: "ping", client: "Studio-Desktop", timestamp: Date.now() },
                          null,
                          2
                        )
                      )
                    }
                  >
                    JSON
                  </button>
                  <button
                    className="btn sm ghost"
                    style={{ fontSize: 10, padding: "2px 6px" }}
                    onClick={() => setWsInput("Hello WebSocket Server!")}
                  >
                    Text
                  </button>
                </div>
              </div>
              <textarea
                className="body-editor"
                style={{ flex: 1, minHeight: 180 }}
                spellCheck={false}
                value={wsInput}
                onChange={(e) => setWsInput(e.target.value)}
                placeholder="Enter text or JSON payload to send..."
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  className="btn primary"
                  disabled={wsStatus !== "connected"}
                  onClick={handleWsSend}
                  title={wsStatus !== "connected" ? "Connect first to send messages" : "Send frame"}
                >
                  Send Message
                </button>
              </div>
            </div>

            <div className="ws-messages-pane">
              <div className="ws-pane-header">
                <span>Message Stream</span>
                <span style={{ fontSize: 10, color: "var(--text-mute)" }}>
                  {wsMessages.length} received/sent
                </span>
              </div>
              <div className="ws-messages-log">
                {wsMessages.length === 0 ? (
                  <div
                    style={{
                      display: "grid",
                      placeItems: "center",
                      height: "100%",
                      color: "var(--text-mute)",
                      fontSize: 12,
                      textAlign: "center",
                      padding: 24,
                    }}
                  >
                    Connect to a WebSocket server above to start streaming messages.
                    <br />
                    <span style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                      Try: wss://echo.websocket.org
                    </span>
                  </div>
                ) : (
                  wsMessages.map((m) => (
                    <div key={m.id} className={`ws-msg-row ${m.direction}`}>
                      <div className="ws-msg-meta">
                        <span style={{ fontWeight: 700 }}>
                          {m.direction === "sent" ? "▲ OUTGOING" : "▼ INCOMING"}
                        </span>
                        <span>{m.time}</span>
                      </div>
                      <div className="ws-msg-data">{m.data}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="pane-tabs">
            {(["params", "auth", "headers", "body", "scripts"] as ReqTab[]).map((t) => (
              <button
                key={t}
                className={`pane-tab ${props.reqTab === t ? "active" : ""}`}
                onClick={() => props.onReqTab(t)}
              >
                {t === "params"
                  ? "Params"
                  : t === "auth"
                    ? "Authorization"
                    : t === "headers"
                      ? "Headers"
                      : t === "body"
                        ? "Body"
                        : "Scripts"}
                {t === "scripts" && (hasPreScript || hasPostScript || Boolean(props.collection?.preScript || props.collection?.postScript)) && (
                  <span
                    className="tab-dot-badge"
                    title={
                      hasPreScript || hasPostScript
                        ? "Scripts defined for this request"
                        : "Collection-level scripts active"
                    }
                  />
                )}
              </button>
            ))}
            {props.envName && <span className="env-chip">🌐 {props.envName}</span>}
          </div>

          <div className={`pane-body ${props.reqTab === "body" ? "is-body-tab" : props.reqTab === "scripts" ? "is-scripts-tab" : ""}`}>
            {/* Params Tab */}
            {props.reqTab === "params" && (
              <>
                <KeyValueEditor
                  rows={draft.params}
                  onChange={(params) => props.onChange({ params })}
                  keyPlaceholder="Key"
                  valuePlaceholder="Value"
                  title="Query Parameters"
                  allowBulkEdit={true}
                />
              </>
            )}

            {/* Auth Tab */}
            {props.reqTab === "auth" && (
              <div className="auth-pane">
                <div className="field" style={{ maxWidth: 220 }}>
                  <label>Auth Type</label>
                  <select
                    value={draft.auth.type}
                    onChange={(e) =>
                      setAuth({ type: e.target.value as AuthConfig["type"] })
                    }
                  >
                    <option value="none">No Auth</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="basic">Basic Auth</option>
                    <option value="apikey">API Key</option>
                  </select>
                </div>
                {draft.auth.type === "bearer" && (
                  <div className="field">
                    <label>Bearer Token</label>
                    <input
                      value={draft.auth.bearerToken}
                      placeholder="{{token}} or raw-token-xyz"
                      onChange={(e) => setAuth({ bearerToken: e.target.value })}
                    />
                  </div>
                )}
                {draft.auth.type === "basic" && (
                  <>
                    <div className="field">
                      <label>Username</label>
                      <input
                        value={draft.auth.basicUser}
                        placeholder="{{user}} or username"
                        onChange={(e) => setAuth({ basicUser: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Password</label>
                      <input
                        type="password"
                        value={draft.auth.basicPass}
                        placeholder="{{password}} or password"
                        onChange={(e) => setAuth({ basicPass: e.target.value })}
                      />
                    </div>
                  </>
                )}
                {draft.auth.type === "apikey" && (
                  <>
                    <div className="field">
                      <label>Key Name</label>
                      <input
                        value={draft.auth.apiKeyName}
                        placeholder="{{key}} or X-API-Key"
                        onChange={(e) => setAuth({ apiKeyName: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Key Value</label>
                      <input
                        value={draft.auth.apiKeyValue}
                        placeholder="{{value}} or key-value"
                        onChange={(e) => setAuth({ apiKeyValue: e.target.value })}
                      />
                    </div>
                    <div className="field" style={{ maxWidth: 180 }}>
                      <label>Add to</label>
                      <select
                        value={draft.auth.apiKeyIn}
                        onChange={(e) =>
                          setAuth({ apiKeyIn: e.target.value as AuthConfig["apiKeyIn"] })
                        }
                      >
                        <option value="header">Header</option>
                        <option value="query">Query Params</option>
                      </select>
                    </div>
                  </>
                )}
                {/* Live Auth Variable Resolution Feedback */}
                {renderVariableChips(authVars)}
              </div>
            )}

            {/* Headers Tab */}
            {props.reqTab === "headers" && (
              <>
                <KeyValueEditor
                  rows={draft.headers}
                  onChange={(headers) => props.onChange({ headers })}
                  keyPlaceholder="Header"
                  valuePlaceholder="Value"
                  title="Headers"
                  allowBulkEdit={true}
                />
                {/* Live Header Variable Resolution Feedback */}
                {renderVariableChips(headerVars)}
              </>
            )}

            {/* Body Tab */}
            {props.reqTab === "body" && (
              <div className="body-tab-pane">
                <div className="body-toolbar">
                  {(["none", "json", "raw", "form-urlencoded"] as BodyMode[]).map((mode) => (
                    <button
                      key={mode}
                      className={`btn sm ${draft.bodyMode === mode ? "primary" : ""}`}
                      onClick={() => props.onChange({ bodyMode: mode })}
                    >
                      {mode}
                    </button>
                  ))}
                  {(draft.bodyMode === "json" || draft.bodyMode === "raw") && (
                    <button
                      className={`btn sm ghost ${beautifyStatus === "success" ? "btn-success" : beautifyStatus === "error" ? "btn-danger" : ""}`}
                      style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}
                      onClick={handleBeautifyJson}
                      title="Beautify / Format JSON payload"
                    >
                      <span>✨</span>
                      <span>
                        {beautifyStatus === "success"
                          ? "Beautified!"
                          : beautifyStatus === "error"
                            ? "Invalid JSON"
                            : "Beautify"}
                      </span>
                    </button>
                  )}
                </div>
                {draft.bodyMode === "none" ? (
                  <div className="empty">This request does not have a body</div>
                ) : (
                  <div className="body-editor-container">
                    {(draft.bodyMode === "json" || draft.bodyMode === "raw") && (
                      <button
                        className={`body-corner-beautify-btn ${beautifyStatus === "success" ? "success" : beautifyStatus === "error" ? "error" : ""}`}
                        onClick={handleBeautifyJson}
                        title="Beautify / Format JSON (Indents & validates JSON payload)"
                      >
                        <span>✨</span>
                        <span>
                          {beautifyStatus === "success"
                            ? "Beautified!"
                            : beautifyStatus === "error"
                              ? "Invalid JSON"
                              : "Beautify JSON"}
                        </span>
                      </button>
                    )}
                    <textarea
                      className="body-editor"
                      spellCheck={false}
                      value={draft.body}
                      placeholder={
                        draft.bodyMode === "json"
                          ? '{\n  "key": "value"\n}'
                          : draft.bodyMode === "form-urlencoded"
                            ? "key1=value1\nkey2=value2"
                            : "Raw request body"
                      }
                      onChange={(e) => props.onChange({ body: e.target.value })}
                    />
                  </div>
                )}
                {/* Live Body Variable Resolution Feedback */}
                {renderVariableChips(bodyVars)}
              </div>
            )}

            {/* Scripts Tab (Postman Style: Pre-request Script & After Response Tests) */}
            {props.reqTab === "scripts" && (
              <div className="scripts-pane-layout">
                {/* Sub-nav left column */}
                <div className="scripts-sub-nav">
                  <button
                    className={`scripts-nav-btn ${scriptSubTab === "pre" ? "active" : ""}`}
                    onClick={() => setScriptSubTab("pre")}
                  >
                    <span className="nav-title">Before request</span>
                    <span className="nav-desc">Pre-request script</span>
                    {hasPreScript && <span className="nav-active-dot" />}
                  </button>
                  <button
                    className={`scripts-nav-btn ${scriptSubTab === "post" ? "active" : ""}`}
                    onClick={() => setScriptSubTab("post")}
                  >
                    <span className="nav-title">After response</span>
                    <span className="nav-desc">Tests & assertions</span>
                    {hasPostScript && <span className="nav-active-dot" />}
                  </button>

                  <div className="scripts-snippets-section">
                    <div className="scripts-snippets-title">QUICK SNIPPETS</div>
                    {scriptSubTab === "pre" ? (
                      <>
                        <button
                          type="button"
                          className="snippet-item-btn"
                          onClick={() =>
                            insertSnippet('pm.environment.set("key", "value");')
                          }
                          title="Set an environment variable"
                        >
                          + Set an env variable
                        </button>
                        <button
                          type="button"
                          className="snippet-item-btn"
                          onClick={() =>
                            insertSnippet('const token = pm.environment.get("token");')
                          }
                          title="Get an environment variable"
                        >
                          + Get an env variable
                        </button>
                        <button
                          type="button"
                          className="snippet-item-btn"
                          onClick={() =>
                            insertSnippet(
                              'pm.request.headers.add({ key: "X-Timestamp", value: Date.now().toString() });'
                            )
                          }
                          title="Add dynamic request header"
                        >
                          + Add dynamic header
                        </button>
                        <button
                          type="button"
                          className="snippet-item-btn"
                          onClick={() =>
                            insertSnippet('console.log("Pre-request script executing...");')
                          }
                          title="Log to console"
                        >
                          + Console log
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="snippet-item-btn"
                          onClick={() =>
                            insertSnippet(
                              'pm.test("Status code is 200", function () {\n    pm.response.to.have.status(200);\n});'
                            )
                          }
                          title="Verify status code is 200"
                        >
                          + Status: Code is 200
                        </button>
                        <button
                          type="button"
                          className="snippet-item-btn"
                          onClick={() =>
                            insertSnippet(
                              'pm.test("Status code is 2xx success", function () {\n    pm.response.to.be.success;\n});'
                            )
                          }
                          title="Verify response status is 2xx"
                        >
                          + Status: Successful (2xx)
                        </button>
                        <button
                          type="button"
                          className="snippet-item-btn"
                          onClick={() =>
                            insertSnippet(
                              'pm.test("Extract token to env", function () {\n    const jsonData = pm.response.json();\n    if (jsonData.token) {\n        pm.environment.set("token", jsonData.token);\n    }\n});'
                            )
                          }
                          title="Extract token from response and save to environment"
                        >
                          + Extract token to env
                        </button>
                        <button
                          type="button"
                          className="snippet-item-btn"
                          onClick={() =>
                            insertSnippet(
                              'pm.test("Response body check", function () {\n    const jsonData = pm.response.json();\n    pm.expect(jsonData).to.be.an("object");\n});'
                            )
                          }
                          title="Assert JSON body structure"
                        >
                          + JSON body check
                        </button>
                        <button
                          type="button"
                          className="snippet-item-btn"
                          onClick={() =>
                            insertSnippet(
                              'pm.test("Response time is less than 500ms", function () {\n    pm.expect(pm.response.responseTime).to.be.below(500);\n});'
                            )
                          }
                          title="Response time below 500ms"
                        >
                          + Response time &lt; 500ms
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Main Script Editor */}
                <div className="scripts-editor-area">
                  {props.collection && (
                    <div className="collection-script-banner">
                      <div className="collection-script-icon">📁</div>
                      <div className="collection-script-info" style={{ flex: 1 }}>
                        <span className="collection-script-title">
                          {props.collection.preScript || props.collection.postScript
                            ? "Collection Script Active"
                            : "Collection-Level Scripts"}
                        </span>
                        <span className="collection-script-desc">
                          {props.collection.preScript || props.collection.postScript ? (
                            <>
                              Parent collection <b>{props.collection.name}</b> has{" "}
                              {[props.collection.preScript ? "Pre-request" : null, props.collection.postScript ? "Tests" : null]
                                .filter(Boolean)
                                .join(" & ")}{" "}
                              scripts defined that run with this request.
                            </>
                          ) : (
                            <>
                              Execute shared JavaScript before or after all requests in <b>{props.collection.name}</b>.
                            </>
                          )}
                        </span>
                      </div>
                      {props.onEditCollection && (
                        <button
                          type="button"
                          className="btn sm"
                          style={{
                            fontSize: 11,
                            padding: "4px 10px",
                            whiteSpace: "nowrap",
                            background: "var(--bg-3)",
                            border: "1px solid var(--border)",
                            color: "var(--accent)",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          onClick={() =>
                            props.onEditCollection!(
                              props.collection!.id,
                              scriptSubTab === "pre" ? "scripts-pre" : "scripts-post"
                            )
                          }
                          title="Open Collection Script Editor"
                        >
                          {props.collection.preScript || props.collection.postScript
                            ? "Edit Collection Scripts ⚡"
                            : "+ Add Collection Script ⚡"}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="scripts-editor-header">
                    <div className="scripts-editor-badge">
                      <span className="badge-tag">JavaScript</span>
                      <span className="scripts-target-title">
                        {scriptSubTab === "pre"
                          ? "Pre-request Script (Executes before sending request)"
                          : "Post-response Tests (Executes after receiving response)"}
                      </span>
                    </div>
                    <div className="scripts-editor-hint">
                      {scriptSubTab === "pre"
                        ? (draft.preScript ? "✓ Pre-request script defined" : "Use pm.environment.set() or dynamic headers.")
                        : (draft.postScript ? "✓ Test assertions defined" : "Use pm.test() and pm.expect() to assert status.")}
                    </div>
                  </div>

                  <div className="scripts-code-container">
                    <textarea
                      className="scripts-textarea"
                      spellCheck={false}
                      value={scriptSubTab === "pre" ? draft.preScript || "" : draft.postScript || ""}
                      placeholder={
                        scriptSubTab === "pre"
                          ? "// Write JavaScript to execute before this request is sent.\n// Example:\npm.environment.set(\"timestamp\", Date.now().toString());\nconsole.log(\"Preparing request for:\", pm.info.requestName);"
                          : "// Write JavaScript tests to execute after response is received.\n// Example:\npm.test(\"Status code is 200\", function () {\n    pm.response.to.have.status(200);\n});\n\npm.test(\"Has valid JSON\", function () {\n    const data = pm.response.json();\n    pm.expect(data).to.be.an(\"object\");\n});"
                      }
                      onChange={(e) => {
                        if (scriptSubTab === "pre") {
                          props.onChange({ preScript: e.target.value });
                        } else {
                          props.onChange({ postScript: e.target.value });
                        }
                      }}
                      onKeyDown={(e) => {
                        // Allow indenting with Tab key
                        if (e.key === "Tab") {
                          e.preventDefault();
                          const target = e.currentTarget;
                          const start = target.selectionStart;
                          const end = target.selectionEnd;
                          const val = target.value;
                          target.value = val.substring(0, start) + "    " + val.substring(end);
                          target.selectionStart = target.selectionEnd = start + 4;
                          if (scriptSubTab === "pre") {
                            props.onChange({ preScript: target.value });
                          } else {
                            props.onChange({ postScript: target.value });
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
