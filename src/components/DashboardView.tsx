import { useEffect, useMemo, useState } from "react";
import type { Collection, Environment, HistoryEntry } from "../types";
import { METHOD_COLORS } from "../types";
import { collectRequests } from "../request";

interface Props {
  collections: Collection[];
  environments: Environment[];
  activeEnvId: string | null;
  history: HistoryEntry[];
  onSelectEnv: (id: string | null) => void;
  onOpenRequest: (collectionId: string, requestId: string) => void;
  onRunCollection: (collection: Collection) => void;
  onNewRequest: (collectionId?: string) => void;
  onImportClick: () => void;
  onManageEnv: () => void;
  onClearHistory: () => void;
  onSwitchToStudio: () => void;
}

export function DashboardView({
  collections,
  environments,
  activeEnvId,
  history,
  onSelectEnv,
  onOpenRequest,
  onRunCollection,
  onNewRequest,
  onImportClick,
  onManageEnv,
  onClearHistory,
  onSwitchToStudio,
}: Props) {
  const [proxyPing, setProxyPing] = useState<{ ok: boolean; time: number } | null>(null);
  const [mockLoading, setMockLoading] = useState<string | null>(null);
  const [mockOutput, setMockOutput] = useState<{
    endpoint: string;
    status: number;
    time: number;
    body: string;
  } | null>(null);

  const activeEnv = useMemo(
    () => environments.find((e) => e.id === activeEnvId) ?? null,
    [environments, activeEnvId]
  );

  const totalRequests = useMemo(
    () => collections.reduce((acc, c) => acc + collectRequests(c.children).length, 0),
    [collections]
  );

  const passedTests = useMemo(() => history.filter((h) => h.ok).length, [history]);
  const failedTests = useMemo(() => history.filter((h) => !h.ok).length, [history]);
  const successRate = history.length
    ? Math.round((passedTests / history.length) * 100)
    : 100;

  // Check proxy ping status
  useEffect(() => {
    let unmounted = false;
    const checkPing = async () => {
      const start = Date.now();
      try {
        const res = await fetch("/api/health");
        if (res.ok && !unmounted) {
          setProxyPing({ ok: true, time: Date.now() - start });
        } else if (!unmounted) {
          setProxyPing({ ok: false, time: 0 });
        }
      } catch {
        if (!unmounted) setProxyPing({ ok: false, time: 0 });
      }
    };
    void checkPing();
    const interval = setInterval(checkPing, 10000);
    return () => {
      unmounted = true;
      clearInterval(interval);
    };
  }, []);

  const runMockQuickTest = async (endpoint: string, method = "GET") => {
    setMockLoading(endpoint);
    const start = Date.now();
    try {
      const res = await fetch(`/api/proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          url: `http://127.0.0.1:3001${endpoint}`,
          headers: endpoint.includes("auth")
            ? { Authorization: "Bearer pulse-demo-token" }
            : {},
          body: method === "POST" ? JSON.stringify({ ping: "dashboard", now: Date.now() }) : null,
          timeout: 5000,
        }),
      });
      const data = await res.json();
      setMockOutput({
        endpoint,
        status: data.status,
        time: data.time || Date.now() - start,
        body: typeof data.body === "string" ? data.body : JSON.stringify(data.body, null, 2),
      });
    } catch (err) {
      setMockOutput({
        endpoint,
        status: 0,
        time: Date.now() - start,
        body: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setMockLoading(null);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Top Welcome & Actions Header */}
      <div className="dash-hero">
        <div className="dash-hero-info">
          <div className="dash-badge">
            <span className="live-pulse" />
            <span>API ENGINE ONLINE · 127.0.0.1:3001</span>
            {proxyPing && proxyPing.ok && (
              <span className="dash-ping-pill">⚡ {proxyPing.time}ms latency</span>
            )}
          </div>
          <h1 className="dash-title">API Operations & Test Dashboard</h1>
          <p className="dash-subtitle">
            Manage collections, test local microservices, orchestrate environments, and inspect live runs.
          </p>
        </div>

        <div className="dash-hero-actions">
          <button
            className="btn primary"
            onClick={onImportClick}
            style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: "6px" }}
            title="Import Postman Collections (.json), README.md, or API documentation (.doc, .docx, .txt)"
          >
            <span>📁</span> Import JSON / README / Doc
          </button>
          <button className="btn ghost" onClick={() => onNewRequest()} style={{ padding: "8px 14px" }}>
            + New Request
          </button>
          <button className="btn" onClick={onSwitchToStudio} style={{ padding: "8px 14px" }}>
            ⚡ Open Request Studio
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="dash-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon-wrap kpi-blue">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="kpi-body">
            <div className="kpi-label">COLLECTIONS</div>
            <div className="kpi-val">{collections.length}</div>
            <div className="kpi-meta">{totalRequests} configured endpoints</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap kpi-purple">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <div className="kpi-body">
            <div className="kpi-label">ACTIVE ENVIRONMENT</div>
            <div className="kpi-val" style={{ fontSize: 18, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
              {activeEnv?.name ?? "None"}
            </div>
            <div className="kpi-meta">
              {activeEnv ? `${activeEnv.variables.filter((v) => v.enabled && v.key).length} active variables` : "Select environment"}
            </div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap kpi-emerald">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div className="kpi-body">
            <div className="kpi-label">TEST PASS RATE</div>
            <div className="kpi-val" style={{ color: successRate >= 80 ? "var(--ok)" : "var(--warn)" }}>
              {successRate}%
            </div>
            <div className="kpi-meta">
              {passedTests} passed · {failedTests} failed ({history.length} runs)
            </div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap kpi-cyan">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
          </div>
          <div className="kpi-body">
            <div className="kpi-label">LOCAL PROXY & CORS</div>
            <div className="kpi-val" style={{ color: proxyPing?.ok ? "var(--ok)" : "var(--err)" }}>
              {proxyPing?.ok ? "Healthy" : "Offline"}
            </div>
            <div className="kpi-meta">Port 3001 · Built-in Mocks Ready</div>
          </div>
        </div>
      </div>

      {/* Main Dashboard Layout (2 Columns) */}
      <div className="dash-content-grid">
        {/* Left Column: Collections Hub & Local Mock Playground */}
        <div className="dash-col-main">
          {/* Section: Collections Hub */}
          <div className="dash-card">
            <div className="dash-card-header">
              <div>
                <h3 className="dash-card-title">Test Collections & Suites</h3>
                <div className="dash-card-subtitle">
                  Import Postman JSON, README.md, or doc files to automatically generate and execute API suites.
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn sm"
                  onClick={onImportClick}
                  title="Import from JSON, README.md, or doc file"
                  style={{ display: "flex", alignItems: "center", gap: 4 }}
                >
                  <span>📁</span> Import Docs / JSON
                </button>
                <button className="btn sm ghost" onClick={() => onNewRequest()}>
                  + New Request
                </button>
              </div>
            </div>

            <div className="dash-collections-list">
              {collections.length === 0 ? (
                <div className="empty-dash">
                  No collections found. Click "Import Docs / JSON" to load collections or parse README.md / doc files.
                </div>
              ) : (
                collections.map((col) => {
                  const reqs = collectRequests(col.children);
                  return (
                    <div key={col.id} className="collection-card">
                      <div className="col-card-head">
                        <div className="col-card-info">
                          <span className="col-folder-badge">📁</span>
                          <div>
                            <div className="col-card-name">{col.name}</div>
                            <div className="col-card-desc">
                              {col.description || `${reqs.length} test requests inside`}
                            </div>
                          </div>
                        </div>

                        <div className="col-card-actions">
                          <button
                            className="btn primary sm"
                            style={{ fontWeight: 700 }}
                            onClick={() => onRunCollection(col)}
                          >
                            ▶ Run Suite ({reqs.length})
                          </button>
                        </div>
                      </div>

                      {/* Request previews */}
                      <div className="col-request-pills">
                        {reqs.slice(0, 5).map((r) => (
                          <div
                            key={r.id}
                            className="req-pill"
                            onClick={() => onOpenRequest(col.id, r.id)}
                            title={`Open ${r.name} in studio`}
                          >
                            <span className={`method ${METHOD_COLORS[r.method]}`}>{r.method}</span>
                            <span className="pill-name">{r.name}</span>
                          </div>
                        ))}
                        {reqs.length > 5 && (
                          <span className="muted" style={{ alignSelf: "center", fontSize: 11 }}>
                            +{reqs.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Section: Local Mock Engine Testbed */}
          <div className="dash-card" style={{ marginTop: 18 }}>
            <div className="dash-card-header">
              <div>
                <h3 className="dash-card-title">Local Mock API Testbed</h3>
                <div className="dash-card-subtitle">
                  Instant offline testing of localhost endpoints and proxy pipeline directly from the dashboard.
                </div>
              </div>
            </div>

            <div className="mock-grid">
              <div className="mock-btn-group">
                <button
                  className="btn sm"
                  disabled={Boolean(mockLoading)}
                  onClick={() => void runMockQuickTest("/api/health", "GET")}
                >
                  <span className="method method-get">GET</span> /api/health
                </button>
                <button
                  className="btn sm"
                  disabled={Boolean(mockLoading)}
                  onClick={() => void runMockQuickTest("/api/mock/echo", "POST")}
                >
                  <span className="method method-post">POST</span> /api/mock/echo
                </button>
                <button
                  className="btn sm"
                  disabled={Boolean(mockLoading)}
                  onClick={() => void runMockQuickTest("/api/mock/users", "GET")}
                >
                  <span className="method method-get">GET</span> /api/mock/users
                </button>
                <button
                  className="btn sm"
                  disabled={Boolean(mockLoading)}
                  onClick={() => void runMockQuickTest("/api/mock/auth-check", "GET")}
                >
                  <span className="method method-get">GET</span> /api/mock/auth-check
                </button>
              </div>

              {mockOutput && (
                <div className="mock-result-box">
                  <div className="mock-result-header">
                    <span>
                      <b>Target:</b> {mockOutput.endpoint}
                    </span>
                    <span
                      className={mockOutput.status === 200 ? "status-ok" : "status-err"}
                      style={{ fontWeight: 700 }}
                    >
                      Status: {mockOutput.status} · {mockOutput.time}ms
                    </span>
                  </div>
                  <pre className="mock-result-body">{mockOutput.body}</pre>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Environment Inspector & Recent Execution Stream */}
        <div className="dash-col-side">
          {/* Active Environment Card */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h3 className="dash-card-title">Environment Variables</h3>
              <button className="btn sm ghost" onClick={onManageEnv}>
                Manage
              </button>
            </div>

            <div className="field" style={{ marginBottom: 10 }}>
              <select
                value={activeEnvId ?? ""}
                onChange={(e) => onSelectEnv(e.target.value || null)}
                style={{ width: "100%", fontSize: 12 }}
              >
                <option value="">No Environment (Raw)</option>
                {environments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.variables.filter((v) => v.enabled && v.key).length} vars)
                  </option>
                ))}
              </select>
            </div>

            {activeEnv ? (
              <div className="env-var-list">
                {activeEnv.variables
                  .filter((v) => v.enabled && v.key)
                  .map((v) => (
                    <div key={v.id} className="env-var-row">
                      <span className="var-key">{v.key}</span>
                      <span className="var-val" title={v.value}>
                        {v.value}
                      </span>
                    </div>
                  ))}
                {activeEnv.variables.filter((v) => v.enabled && v.key).length === 0 && (
                  <div className="empty-dash">No variables in this environment.</div>
                )}
              </div>
            ) : (
              <div className="empty-dash">Select or create an environment to manage variables.</div>
            )}
          </div>

          {/* Recent Runs Timeline */}
          <div className="dash-card" style={{ marginTop: 18 }}>
            <div className="dash-card-header">
              <h3 className="dash-card-title">Recent Run History</h3>
              {history.length > 0 && (
                <button className="btn sm ghost" onClick={onClearHistory}>
                  Clear
                </button>
              )}
            </div>

            <div className="history-stream">
              {history.length === 0 ? (
                <div className="empty-dash">No requests executed yet. Run a collection to see activity!</div>
              ) : (
                history.slice(0, 10).map((h) => (
                  <div key={h.id} className="history-stream-row">
                    <span className={`method ${METHOD_COLORS[h.method]}`}>{h.method}</span>
                    <span className="hist-url" title={h.url}>
                      {h.url}
                    </span>
                    <span
                      className={h.error ? "status-err" : h.ok ? "status-ok" : "status-warn"}
                      style={{ fontWeight: 700, fontSize: 11 }}
                    >
                      {h.status || "ERR"}
                    </span>
                    <span className="hist-time">{h.time}ms</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
