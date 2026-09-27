import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthConfig, BodyMode, Collection, Environment, HttpMethod, RequestSnapshot } from "../types";
import { METHODS, METHOD_COLORS } from "../types";
import { KeyValueEditor } from "./KeyValueEditor";
import { extractVariables, interpolate, lookupVariable } from "../request";

type ReqTab = "params" | "headers" | "body" | "auth";

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
  collection?: Collection | null;
  onReqTab: (t: ReqTab) => void;
  onChange: (patch: Partial<RequestSnapshot>) => void;
  onSend: () => void;
}

export function RequestPane(props: Props) {
  const { draft, env, collection } = props;

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

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const setAuth = (patch: Partial<AuthConfig>) =>
    props.onChange({ auth: { ...draft.auth, ...patch } });

  const resolvedUrl = useMemo(
    () => interpolate(draft.url, env ?? null, collection ?? null),
    [draft.url, env, collection]
  );

  const detectedVars = useMemo(() => extractVariables(draft.url), [draft.url]);

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
        const time = new Date().toLocaleTimeString();
        setWsMessages((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            direction: "recv",
            data: `[System] Connected to ${targetUrl}`,
            time,
          },
        ]);
      };

      ws.onmessage = (event) => {
        const time = new Date().toLocaleTimeString();
        setWsMessages((prev) => [
          ...prev,
          {
            id: String(Date.now()) + Math.random(),
            direction: "recv",
            data: typeof event.data === "string" ? event.data : "[Binary frame]",
            time,
          },
        ]);
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        setWsStatus("error");
        setWsError("WebSocket connection encountered an error.");
      };

      ws.onclose = (event) => {
        setWsStatus("disconnected");
        wsRef.current = null;
        const time = new Date().toLocaleTimeString();
        setWsMessages((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            direction: "recv",
            data: `[System] Disconnected (code: ${event.code}${event.reason ? `, ${event.reason}` : ""})`,
            time,
          },
        ]);
      };
    } catch (e) {
      setWsStatus("error");
      setWsError(e instanceof Error ? e.message : "Failed to initialize WebSocket");
    }
  };

  const handleWsSend = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert("WebSocket is not connected!");
      return;
    }
    const msg = wsInput;
    wsRef.current.send(msg);
    const time = new Date().toLocaleTimeString();
    setWsMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()) + Math.random(),
        direction: "sent",
        data: msg,
        time,
      },
    ]);
  };

  return (
    <div className="pane request-pane">
      <div className="urlbar">
        <select
          className={`method-select ${METHOD_COLORS[draft.method]}`}
          value={draft.method}
          onChange={(e) => {
            const nextMethod = e.target.value as HttpMethod;
            props.onChange({
              method: nextMethod,
              url:
                nextMethod === "WS" && (!draft.url || draft.url.startsWith("http"))
                  ? "wss://echo.websocket.org"
                  : draft.url,
            });
          }}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          className="url-input"
          placeholder={
            isWebSocket
              ? "wss://echo.websocket.org  or  ws://localhost:8080/ws"
              : "{{baseUrl}}/path  or  https://api.example.com/v1"
          }
          value={draft.url}
          onChange={(e) => props.onChange({ url: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (isWebSocket) handleWsConnect();
              else props.onSend();
            }
          }}
        />
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
          <button className="send-btn" disabled={props.sending} onClick={props.onSend}>
            {props.sending ? "Sending" : "Send"}
          </button>
        )}
      </div>

      {/* Target URL Resolution Bar */}
      {detectedVars.length > 0 && (
        <div className="url-resolution-bar">
          <div className="res-badge">
            <span className="res-dot" />
            <span>RESOLVED:</span>
          </div>
          <span className="res-url" title={resolvedUrl}>
            {resolvedUrl}
          </span>
          <div className="res-vars-pills">
            {detectedVars.map((v) => {
              const hit = lookupVariable(v, env ?? null, collection ?? null);
              return hit ? (
                <span
                  key={v}
                  className="res-var-chip ok"
                  title={`From ${hit.sourceName}: ${v} = ${hit.value}`}
                >
                  <span className="chip-key">{`{{${v}}}`}</span>
                  <span className="chip-arrow">→</span>
                  <span className="chip-val">{hit.value || '""'}</span>
                </span>
              ) : (
                <span
                  key={v}
                  className="res-var-chip missing"
                  title={`Missing in active environment (${env?.name || "none"})`}
                >
                  ⚠️ {`{{${v}}}`} <span className="chip-missing-tag">unresolved</span>
                </span>
              );
            })}
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
                  Clear log
                </button>
              )}
            </div>
          </div>

          {wsError && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: 6,
                padding: "8px 12px",
                color: "#fca5a5",
                fontSize: 12,
              }}
            >
              ⚠️ {wsError}
            </div>
          )}

          <div className="ws-split-view">
            <div className="ws-compose-pane">
              <div className="ws-pane-header">
                <span>Compose Message</span>
                <div style={{ display: "flex", gap: 6 }}>
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
            {(["params", "headers", "body", "auth"] as ReqTab[]).map((t) => (
              <button
                key={t}
                className={`pane-tab ${props.reqTab === t ? "active" : ""}`}
                onClick={() => props.onReqTab(t)}
              >
                {t === "params" ? "Params" : t === "headers" ? "Headers" : t === "body" ? "Body" : "Auth"}
              </button>
            ))}
            {props.envName && <span className="env-chip">E  {props.envName}</span>}
          </div>
          <div className="pane-body">
            {props.reqTab === "params" && (
              <>
                <div className="kv-caption">Query Params</div>
                <KeyValueEditor
                  rows={draft.params}
                  onChange={(params) => props.onChange({ params })}
                  keyPlaceholder="Key"
                  valuePlaceholder="Value"
                />
              </>
            )}
            {props.reqTab === "headers" && (
              <KeyValueEditor
                rows={draft.headers}
                onChange={(headers) => props.onChange({ headers })}
                keyPlaceholder="Header"
                valuePlaceholder="Value"
              />
            )}
            {props.reqTab === "body" && (
              <>
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
                </div>
                {draft.bodyMode === "none" ? (
                  <div className="empty">This request does not have a body</div>
                ) : (
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
                )}
              </>
            )}
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
                    <label>Token</label>
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
                        placeholder="user"
                        onChange={(e) => setAuth({ basicUser: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Password</label>
                      <input
                        type="password"
                        value={draft.auth.basicPass}
                        placeholder="password"
                        onChange={(e) => setAuth({ basicPass: e.target.value })}
                      />
                    </div>
                  </>
                )}
                {draft.auth.type === "apikey" && (
                  <>
                    <div className="field">
                      <label>Key</label>
                      <input
                        value={draft.auth.apiKeyName}
                        placeholder="X-API-Key"
                        onChange={(e) => setAuth({ apiKeyName: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Value</label>
                      <input
                        value={draft.auth.apiKeyValue}
                        placeholder="key-value"
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
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
