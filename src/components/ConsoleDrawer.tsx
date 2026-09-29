import { useEffect, useMemo, useRef, useState, type FC } from "react";
import type { Collection, ConsoleLog, Environment } from "../types";
import { METHOD_COLORS } from "../types";
import { getProxyBaseUrl } from "../request";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  logs: ConsoleLog[];
  onClear: () => void;
  environments: Environment[];
  activeEnv: Environment | null;
  collections: Collection[];
  height: number;
  onHeightChange: (h: number) => void;
  onExecuteCommand?: (cmd: string) => Promise<string | void>;
  onLoadSamples?: () => void;
}

type TabType = "all" | "network" | "logs" | "errors" | "terminal";

export const ConsoleDrawer: FC<Props> = ({
  isOpen,
  onClose,
  logs,
  onClear,
  environments,
  activeEnv,
  collections,
  height,
  onHeightChange,
  onLoadSamples,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"headers" | "body" | "curl">("headers");
  const [isMaximized, setIsMaximized] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Terminal state
  const [termLines, setTermLines] = useState<Array<{ id: string; type: "in" | "out" | "err"; text: string }>>(() => [
    { id: "1", type: "out", text: "Pulse Studio Terminal v1.0.0 — Type 'help' for available commands." },
  ]);
  const [termInput, setTermInput] = useState("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const termScrollRef = useRef<HTMLDivElement>(null);
  const termInputRef = useRef<HTMLInputElement>(null);
  const isResizingRef = useRef(false);

  // Auto-scroll on new logs
  useEffect(() => {
    if (autoScroll && scrollRef.current && activeTab !== "terminal") {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll, activeTab]);

  useEffect(() => {
    if (termScrollRef.current && activeTab === "terminal") {
      termScrollRef.current.scrollTop = termScrollRef.current.scrollHeight;
    }
  }, [termLines, activeTab]);

  // Resizing handler
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    const startY = e.clientY;
    const startHeight = height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(160, Math.min(Math.floor(window.innerHeight * 0.8), startHeight + deltaY));
      onHeightChange(newHeight);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const filteredLogs = useMemo(() => {
    let list = logs;
    if (activeTab === "network") {
      list = list.filter((l) => l.type === "network");
    } else if (activeTab === "logs") {
      list = list.filter((l) => l.type === "log" || l.type === "info");
    } else if (activeTab === "errors") {
      list = list.filter((l) => l.type === "error" || (l.status && l.status >= 400));
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        (l.url && l.url.toLowerCase().includes(q)) ||
        (l.statusText && l.statusText.toLowerCase().includes(q))
    );
  }, [logs, activeTab, search]);

  const copyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1400);
    } catch {
      window.alert("Failed to copy to clipboard");
    }
  };

  // Terminal command execution
  const runTerminalCommand = async (cmdStr: string) => {
    const raw = cmdStr.trim();
    if (!raw) return;

    setCmdHistory((prev) => [...prev, raw]);
    setHistoryIdx(-1);
    setTermLines((prev) => [...prev, { id: String(Date.now()), type: "in", text: raw }]);

    const parts = raw.split(" ");
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(" ");

    let outText = "";
    let isErr = false;

    switch (cmd) {
      case "help":
        outText = [
          "Pulse CLI & Terminal Commands:",
          "  help                Show this list of commands",
          "  samples             Load sample test collections & environments",
          "  clear               Clear terminal output & console logs",
          "  ping                Test proxy server (http://127.0.0.1:3001/api/health)",
          "  env                 List active environment variables",
          "  collections         List all API collections and request count",
          "  history             Show last 10 executed requests",
          "  get <url>           Send quick GET request through proxy",
          "  version             Display Pulse API Studio version info",
        ].join("\n");
        break;

      case "samples":
      case "seed":
        if (onLoadSamples) {
          onLoadSamples();
          outText = "[SUCCESS] Sample collections and test environments loaded into workspace!";
        } else {
          outText = "Sample loader is not available.";
        }
        break;

      case "clear":
        setTermLines([]);
        onClear();
        return;

      case "ping":
        try {
          if (typeof window !== "undefined" && window.pulseDesktop?.checkHealth) {
            const health = await window.pulseDesktop.checkHealth();
            outText = `[PONG] Native Desktop Proxy Engine is ONLINE: ${JSON.stringify(health)}`;
          } else {
            const res = await fetch(`${getProxyBaseUrl()}/api/health`);
            if (res.ok) {
              const data = await res.json();
              outText = `[PONG] Proxy Engine is ONLINE: ${JSON.stringify(data)}`;
            } else {
              outText = `[PONG] Server responded with status ${res.status}`;
            }
          }
        } catch (e) {
          isErr = true;
          outText = `[ERROR] Proxy unreachable: ${e instanceof Error ? e.message : String(e)}`;
        }
        break;

      case "env":
        if (!activeEnv) {
          outText = environments.length > 0
            ? `No active environment selected. Available environments (${environments.length}): ${environments.map((e) => e.name).join(", ")}`
            : "No active environment selected. Use the top environment selector.";
        } else {
          outText = `Active Environment: "${activeEnv.name}" (${activeEnv.variables.length} vars)\n` +
            activeEnv.variables.map((v) => `  ${v.key} = "${v.value}" (${v.enabled ? "enabled" : "disabled"})`).join("\n") +
            (environments.length > 1 ? `\n(All environments: ${environments.map((e) => e.name).join(", ")})` : "");
        }
        break;

      case "collections":
        if (collections.length === 0) {
          outText = "No collections available. Create one using the sidebar '+ Collection' button.";
        } else {
          outText = `Collections (${collections.length}):\n` +
            collections.map((c, i) => `  ${i + 1}. [${c.name}] (${c.children.length} items)`).join("\n");
        }
        break;

      case "history":
        if (logs.length === 0) {
          outText = "No requests recorded in history yet.";
        } else {
          const recent = logs.slice(-10).reverse();
          outText = recent
            .map((l) => `  [${new Date(l.timestamp).toLocaleTimeString()}] ${l.method || "REQ"} ${l.url || l.title} -> ${l.status || "ERR"} (${l.time || 0}ms)`)
            .join("\n");
        }
        break;

      case "get":
      case "curl":
        if (!args) {
          isErr = true;
          outText = "Usage: get <url> (e.g. get https://jsonplaceholder.typicode.com/todos/1)";
        } else {
          const targetUrl = args.startsWith("http") ? args : `https://${args}`;
          outText = `Sending GET ${targetUrl}...`;
          try {
            const t0 = performance.now();
            let json: any;
            if (typeof window !== "undefined" && window.pulseDesktop?.proxyRequest) {
              json = await window.pulseDesktop.proxyRequest({ method: "GET", url: targetUrl, headers: {} });
            } else {
              const res = await fetch(`${getProxyBaseUrl()}/api/proxy`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ method: "GET", url: targetUrl, headers: {} }),
              });
              json = await res.json();
            }
            const delta = Math.round(performance.now() - t0);
            outText = `[${json.status} ${json.statusText || ""}] in ${delta}ms\n` +
              (typeof json.body === "string" ? json.body.slice(0, 1000) : JSON.stringify(json.body, null, 2).slice(0, 1000));
          } catch (e) {
            isErr = true;
            outText = `Request error: ${e instanceof Error ? e.message : String(e)}`;
          }
        }
        break;

      case "version":
        outText = "Pulse API Studio: v1.0.0 (Desktop & Web Engine)\nNode / Electron Ready\nArchitecture: Universal (macOS .dmg & Windows .exe)";
        break;

      default:
        isErr = true;
        outText = `Command not recognized: "${cmd}". Type 'help' to see valid commands.`;
    }

    setTermLines((prev) => [...prev, { id: String(Date.now() + 1), type: isErr ? "err" : "out", text: outText }]);
  };

  const handleTermKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void runTerminalCommand(termInput);
      setTermInput("");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const nextIdx = historyIdx === -1 ? cmdHistory.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(nextIdx);
      setTermInput(cmdHistory[nextIdx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (cmdHistory.length === 0 || historyIdx === -1) return;
      const nextIdx = historyIdx + 1;
      if (nextIdx >= cmdHistory.length) {
        setHistoryIdx(-1);
        setTermInput("");
      } else {
        setHistoryIdx(nextIdx);
        setTermInput(cmdHistory[nextIdx]);
      }
    }
  };

  if (!isOpen) return null;

  const currentHeight = isMaximized ? Math.floor(window.innerHeight * 0.78) : height;

  const netCount = logs.filter((l) => l.type === "network").length;
  const errCount = logs.filter((l) => l.type === "error" || (l.status && l.status >= 400)).length;

  return (
    <div
      className="console-drawer"
      style={{ height: currentHeight }}
      role="region"
      aria-label="Pulse Console and Terminal"
    >
      {/* Top resize handle */}
      <div
        className="console-resizer-handle"
        onMouseDown={handleMouseDown}
        title="Drag up/down to resize console"
      />

      {/* Console Top Toolbar */}
      <div className="console-toolbar">
        <div className="console-tabs">
          <div className="console-brand-tag">
            <span className="console-prompt-glyph">&gt;_</span>
            <span>Console</span>
          </div>

          <button
            className={`console-tab ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All <span className="console-tab-count">{logs.length}</span>
          </button>
          <button
            className={`console-tab ${activeTab === "network" ? "active" : ""}`}
            onClick={() => setActiveTab("network")}
          >
            Network <span className="console-tab-count">{netCount}</span>
          </button>
          <button
            className={`console-tab ${activeTab === "errors" ? "active" : ""}`}
            onClick={() => setActiveTab("errors")}
          >
            Errors {errCount > 0 && <span className="console-tab-err-badge">{errCount}</span>}
          </button>
          <button
            className={`console-tab ${activeTab === "logs" ? "active" : ""}`}
            onClick={() => setActiveTab("logs")}
          >
            Logs
          </button>
          <button
            className={`console-tab terminal-tab ${activeTab === "terminal" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("terminal");
              setTimeout(() => termInputRef.current?.focus(), 50);
            }}
          >
            <span className="term-dot" />
            Terminal (CLI)
          </button>
        </div>

        {/* Search input (only for log lists) */}
        {activeTab !== "terminal" && (
          <div className="console-search-box">
            <input
              type="text"
              placeholder="Filter logs / URLs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="console-search-input"
            />
            {search && (
              <button className="console-search-clear" onClick={() => setSearch("")}>
                ✕
              </button>
            )}
          </div>
        )}

        {/* Right actions */}
        <div className="console-actions">
          <button
            className="console-icon-btn"
            title="Clear all console logs"
            onClick={() => {
              onClear();
              setTermLines([]);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span>Clear</span>
          </button>

          {activeTab !== "terminal" && (
            <button
              className={`console-icon-btn ${autoScroll ? "active-toggle" : ""}`}
              title={autoScroll ? "Auto-scroll ON (click to freeze)" : "Auto-scroll OFF (click to enable)"}
              onClick={() => setAutoScroll((v) => !v)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <span>Scroll</span>
            </button>
          )}

          <button
            className="console-icon-btn"
            title={isMaximized ? "Restore Height" : "Maximize Console"}
            onClick={() => setIsMaximized((v) => !v)}
          >
            {isMaximized ? "🗗" : "🗖"}
          </button>

          <button className="console-close-btn" title="Close Console" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="console-body">
        {activeTab === "terminal" ? (
          /* Terminal Interactive CLI */
          <div className="console-terminal-view">
            <div className="console-terminal-output" ref={termScrollRef}>
              {termLines.map((line) => (
                <div key={line.id} className={`terminal-line line-${line.type}`}>
                  {line.type === "in" && <span className="term-prompt-marker">pulse &gt; </span>}
                  <span className="term-line-content">{line.text}</span>
                </div>
              ))}
            </div>
            <div className="console-terminal-prompt-bar">
              <span className="term-prompt-glyph">pulse &gt;</span>
              <input
                ref={termInputRef}
                type="text"
                className="console-terminal-input"
                placeholder="Type 'help', 'ping', 'env', 'collections', or 'get <url>'..."
                value={termInput}
                onChange={(e) => setTermInput(e.target.value)}
                onKeyDown={handleTermKeyDown}
                autoFocus
              />
              <button
                className="console-terminal-run-btn"
                onClick={() => {
                  void runTerminalCommand(termInput);
                  setTermInput("");
                }}
              >
                Run
              </button>
            </div>
          </div>
        ) : (
          /* Log Stream */
          <div className="console-log-stream" ref={scrollRef}>
            {filteredLogs.length === 0 ? (
              <div className="console-empty-state">
                <div style={{ fontSize: 24, marginBottom: 4 }}>📋</div>
                <div>No logs to display in this view</div>
                <div className="console-empty-hint">Send a request or type commands in the Terminal tab to inspect network telemetry.</div>
              </div>
            ) : (
              filteredLogs.map((log) => {
                const isExpanded = expandedId === log.id;
                const isNet = log.type === "network";
                const isErr = log.type === "error" || (log.status && log.status >= 400);
                const statusCls =
                  log.status && log.status >= 200 && log.status < 300
                    ? "status-ok"
                    : log.status && log.status >= 300 && log.status < 400
                    ? "status-redirect"
                    : isErr
                    ? "status-error"
                    : "status-other";

                return (
                  <div key={log.id} className={`console-row ${isExpanded ? "expanded" : ""} ${isErr ? "row-error" : ""} ${isNet ? "row-network" : ""}`}>
                    <div
                      className="console-row-summary"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      <span className="console-chev">{isExpanded ? "⌄" : "›"}</span>
                      <span className="console-time">{new Date(log.timestamp).toLocaleTimeString()}</span>

                      {log.method ? (
                        <span className={`console-method ${METHOD_COLORS[log.method] || ""}`}>{log.method}</span>
                      ) : (
                        <span className={`console-type-badge badge-${log.type}`}>{log.type.toUpperCase()}</span>
                      )}

                      {log.status !== undefined && (
                        <span className={`console-status-pill ${statusCls}`}>
                          {log.status === 0 ? "ERR" : log.status}
                          {log.statusText && log.statusText !== "OK" ? ` ${log.statusText}` : ""}
                        </span>
                      )}

                      <span className="console-url-title" title={log.url || log.title}>
                        {log.url || log.title}
                      </span>

                      {log.time !== undefined && <span className="console-stat-time">{log.time}ms</span>}
                      {log.size !== undefined && (
                        <span className="console-stat-size">{(log.size / 1024).toFixed(1)} KB</span>
                      )}

                      {log.curl && (
                        <button
                          className="console-mini-copy-btn"
                          title="Copy cURL command"
                          onClick={(e) => {
                            e.stopPropagation();
                            void copyText(log.curl!, log.id);
                          }}
                        >
                          {copiedId === log.id ? "✓ Copied" : "cURL"}
                        </button>
                      )}
                    </div>

                    {/* Expanded Inspector Panel */}
                    {isExpanded && (
                      <div className="console-row-details">
                        <div className="console-subtabs">
                          <button
                            className={`console-subtab ${activeSubTab === "headers" ? "active" : ""}`}
                            onClick={() => setActiveSubTab("headers")}
                          >
                            Headers
                          </button>
                          <button
                            className={`console-subtab ${activeSubTab === "body" ? "active" : ""}`}
                            onClick={() => setActiveSubTab("body")}
                          >
                            Payload &amp; Response Body
                          </button>
                          {log.curl && (
                            <button
                              className={`console-subtab ${activeSubTab === "curl" ? "active" : ""}`}
                              onClick={() => setActiveSubTab("curl")}
                            >
                              cURL
                            </button>
                          )}
                        </div>

                        <div className="console-subtab-content">
                          {activeSubTab === "headers" && (
                            <div className="console-headers-grid">
                              <div className="console-header-col">
                                <div className="console-subheading">
                                  Request Headers ({Object.keys(log.requestHeaders || {}).length})
                                </div>
                                {log.requestHeaders && Object.keys(log.requestHeaders).length > 0 ? (
                                  <table className="console-table">
                                    <tbody>
                                      {Object.entries(log.requestHeaders).map(([k, v]) => (
                                        <tr key={k}>
                                          <td className="k-cell">{k}</td>
                                          <td className="v-cell">{v}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <div className="console-none">No custom request headers</div>
                                )}
                              </div>

                              <div className="console-header-col">
                                <div className="console-subheading">
                                  Response Headers ({Object.keys(log.responseHeaders || {}).length})
                                </div>
                                {log.responseHeaders && Object.keys(log.responseHeaders).length > 0 ? (
                                  <table className="console-table">
                                    <tbody>
                                      {Object.entries(log.responseHeaders).map(([k, v]) => (
                                        <tr key={k}>
                                          <td className="k-cell">{k}</td>
                                          <td className="v-cell">{v}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <div className="console-none">No response headers</div>
                                )}
                              </div>
                            </div>
                          )}

                          {activeSubTab === "body" && (
                            <div className="console-body-grid">
                              {log.requestBody && (
                                <div className="console-body-box">
                                  <div className="console-subheading-bar">
                                    <span>Request Body</span>
                                    <button
                                      className="console-inline-copy"
                                      onClick={() => void copyText(log.requestBody!, `${log.id}-req`)}
                                    >
                                      {copiedId === `${log.id}-req` ? "✓ Copied" : "Copy"}
                                    </button>
                                  </div>
                                  <pre className="console-code-block">{log.requestBody}</pre>
                                </div>
                              )}

                              <div className="console-body-box">
                                <div className="console-subheading-bar">
                                  <span>Response Body</span>
                                  {log.responseBody && (
                                    <button
                                      className="console-inline-copy"
                                      onClick={() => void copyText(log.responseBody!, `${log.id}-res`)}
                                    >
                                      {copiedId === `${log.id}-res` ? "✓ Copied" : "Copy"}
                                    </button>
                                  )}
                                </div>
                                <pre className="console-code-block">
                                  {log.responseBody || "(Empty response body)"}
                                </pre>
                              </div>
                            </div>
                          )}

                          {activeSubTab === "curl" && log.curl && (
                            <div className="console-curl-box">
                              <div className="console-subheading-bar">
                                <span>cURL Command</span>
                                <button
                                  className="console-inline-copy"
                                  onClick={() => void copyText(log.curl!, `${log.id}-curl`)}
                                >
                                  {copiedId === `${log.id}-curl` ? "✓ Copied" : "Copy cURL"}
                                </button>
                              </div>
                              <pre className="console-code-block">{log.curl}</pre>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
