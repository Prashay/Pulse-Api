import { useEffect, useMemo, useRef, useState } from "react";
import type { Collection, Environment, HistoryEntry, RequestItem } from "../types";
import { METHOD_COLORS } from "../types";
import { collectRequests, getProxyBaseUrl } from "../request";
import { ResponsePane } from "./ResponsePane";

type OverviewStyle = "glass" | "pearl" | "dark-glass";

interface Props {
  overviewStyle?: OverviewStyle;
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
  onLoadSamples?: () => void;
  onOpenDownload?: () => void;
}

function DashboardOverview({ style, collections, history, passed, activeEnvironment, proxyOnline, totalRequests }: {
  style: OverviewStyle;
  collections: Collection[];
  history: HistoryEntry[];
  passed: number;
  activeEnvironment?: string;
  proxyOnline?: boolean;
  totalRequests: number;
}) {
  const rate = history.length ? Math.round(passed / history.length * 100) : 0;
  const [daysAgo, setDaysAgo] = useState(0);
  const dates = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + index - 6);
    return day;
  });
  const activity = style !== "glass" ? dates.map((day) => {
    const end = new Date(day);
    end.setDate(end.getDate() + 1);
    return history.filter((run) => run.timestamp >= day.getTime() && run.timestamp < end.getTime()).length;
  }) : [];
  const activityMax = Math.max(1, ...activity);
  const apiCounts = new Map<string, { method: HistoryEntry["method"]; url: string; count: number }>();
  let dailyRuns = 0;
  if (style === "glass") {
    const day = dates[dates.length - 1 - daysAgo];
    const end = new Date(day);
    end.setDate(end.getDate() + 1);
    for (const { method, url, timestamp } of history) {
      if (timestamp < day.getTime() || timestamp >= end.getTime() || !url.trim()) continue;
      dailyRuns += 1;
      const key = `${method} ${url}`;
      const api = apiCounts.get(key);
      if (api) api.count += 1;
      else apiCounts.set(key, { method, url, count: 1 });
    }
  }
  const mostUsed = [...apiCounts.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const maxRuns = mostUsed[0]?.count ?? 1;

  return (
    <section className={`dashboard-overview overview-${style}`} aria-label="Workspace overview">
      <div className="dash-card overview-outcomes">
        <h3 className="dash-card-title">Request outcomes</h3>
        {style === "glass" && (
          <div className="overview-ring" style={{ background: history.length ? `conic-gradient(var(--accent) ${rate}%, var(--glass-chart-track) 0)` : undefined }} aria-hidden="true">
            <span>{history.length}</span>
          </div>
        )}
        <strong className="overview-value">{history.length ? `${rate}%` : "—"}</strong>
        <p className="muted">{history.length ? "Successful requests" : "No requests recorded"}</p>
        {style !== "glass" && history.length > 0 && (
          <div className="overview-segments" aria-hidden="true">
            <span style={{ flexGrow: passed }} />
            <span style={{ flexGrow: history.length - passed }} />
          </div>
        )}
        <div className="overview-outcome-counts">
          <span>{passed} succeeded</span><span>{history.length - passed} failed</span>
        </div>
      </div>
      <div className="dash-card overview-chart">
        <div className="overview-chart-header">
          <h3 className="dash-card-title">{style === "glass" ? "Most used APIs" : "Recorded runs by day"}</h3>
          {style === "glass" && (
            <select aria-label="API usage day" value={daysAgo} onChange={(event) => setDaysAgo(Number(event.target.value))}>
              {[...dates].reverse().map((day, index) => (
                <option key={day.getTime()} value={index}>
                  {index === 0 ? "Today" : day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </option>
              ))}
            </select>
          )}
        </div>
        {style === "glass" ? (
          <>
            <div className="api-usage-counters">
              <div><span>Recorded runs</span><strong>{dailyRuns}</strong></div>
              <div><span>Unique APIs</span><strong>{apiCounts.size}</strong></div>
              <div><span>Top API runs</span><strong>{mostUsed[0]?.count ?? 0}</strong></div>
            </div>
            {mostUsed.length > 0 ? (
              <ol className="api-usage-chart" aria-label="Top APIs by recorded runs">
                {mostUsed.map(({ method, url, count }) => (
                  <li className="api-usage-row" key={`${method} ${url}`}>
                    <span className={`method ${METHOD_COLORS[method]}`}>{method}</span>
                    <span className="api-usage-url" title={url}>{url}</span>
                    <strong>{count}</strong>
                    <div className="overview-track" aria-hidden="true"><span style={{ width: `${count / maxRuns * 100}%` }} /></div>
                  </li>
                ))}
              </ol>
            ) : <p className="muted">No API runs recorded for this day.</p>}
          </>
        ) : (
          <div className="overview-activity">
            {dates.map((day, index) => (
              <div key={day.getTime()} title={day.toLocaleDateString()}>
                <strong>{activity[index]}</strong>
                <div className="overview-track" aria-hidden="true"><span style={{ height: `${activity[index] / activityMax * 100}%` }} /></div>
                <span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="overview-workspace">
        <div className="dash-card"><h3 className="dash-card-title">Collections</h3><strong className="overview-value">{collections.length}</strong><div className="muted">{totalRequests} endpoints</div></div>
        <div className="dash-card"><h3 className="dash-card-title">Active environment</h3><strong>{activeEnvironment ?? "None"}</strong></div>
        <div className="dash-card"><h3 className="dash-card-title">Local proxy</h3><strong>{proxyOnline === undefined ? "Checking" : proxyOnline ? "Healthy" : "Offline"}</strong></div>
      </div>
    </section>
  );
}

function latencyKey({ requestId, method, url }: Pick<HistoryEntry, "requestId" | "method" | "url">) {
  return JSON.stringify([requestId ?? null, method, url]);
}

function RequestLatency({ run }: { run?: HistoryEntry }) {
  if (!run) return <span className="request-latency muted">Not run</span>;
  if (!run.status) return <span className="request-latency muted">No response</span>;

  const latency = run.time;
  const band = latency < 300 ? "fast" : latency <= 1200 ? "moderate" : "slow";
  const fill = Math.min(100, Math.max(8, latency / 12));
  return (
    <span className={`request-latency ${band}`} title={`Latest response: ${latency} ms (${band})`}>
      <span className="request-latency-track" aria-hidden="true">
        <span style={{ width: `${fill}%` }} />
      </span>
      <span>{latency} ms</span>
    </span>
  );
}

export function DashboardView({
  overviewStyle,
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
  onLoadSamples,
  onOpenDownload,
}: Props) {
  const [selectedRun, setSelectedRun] = useState<HistoryEntry | null>(null);
  const historyDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = historyDialog.current;
    if (selectedRun && dialog && !dialog.open) dialog.showModal();
  }, [selectedRun]);

  const [proxyPing, setProxyPing] = useState<{ ok: boolean; time: number } | null>(null);
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
  const latestRuns = useMemo(() => {
    const runs = new Map<string, HistoryEntry>();
    for (const entry of history) {
      if (entry.requestId === null) continue;
      const key = latencyKey(entry);
      if (!runs.has(key)) runs.set(key, entry);
    }
    return runs;
  }, [history]);

  const renderRequest = (collectionId: string, request: RequestItem) => {
    const run = latestRuns.get(latencyKey({ ...request, requestId: request.id }))
      ?? latestRuns.get(latencyKey(request));
    return (
      <button
        key={request.id}
        type="button"
        className="req-pill"
        onClick={() => onOpenRequest(collectionId, request.id)}
        title={`Open ${request.name} in studio`}
      >
        <span className={`method ${METHOD_COLORS[request.method]}`}>{request.method}</span>
        <span className="pill-name">{request.name}</span>
        <RequestLatency run={run} />
      </button>
    );
  };
  const successRate = history.length
    ? Math.round((passedTests / history.length) * 100)
    : 100;

  // Check proxy ping status
  useEffect(() => {
    let unmounted = false;
    const checkPing = async () => {
      const start = Date.now();
      try {
        if (typeof window !== "undefined" && window.pulseDesktop?.checkHealth) {
          const health = await window.pulseDesktop.checkHealth();
          if (health?.ok && !unmounted) {
            setProxyPing({ ok: true, time: Date.now() - start });
            return;
          }
        }
        const res = await fetch(`${getProxyBaseUrl()}/api/health`);
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
            className="btn primary dash-action-btn"
            onClick={onImportClick}
            title="Import Postman Collections (.json), README.md, or API documentation (.doc, .docx, .txt)"
          >
            <span aria-hidden="true">📁</span>
            <span>Import JSON / Doc</span>
          </button>
          <button className="btn ghost dash-action-btn" onClick={() => onNewRequest()}>
            <span aria-hidden="true">+</span>
            <span>New Request</span>
          </button>
          {onLoadSamples && (
            <button
              className="btn dash-action-btn"
              onClick={onLoadSamples}
              title="Load pre-configured sample test collections & environments"
            >
              <span aria-hidden="true">🧪</span>
              <span>Sample Test Suite</span>
            </button>
          )}
          <button className="btn dash-action-btn" onClick={onSwitchToStudio}>
            <span aria-hidden="true">⚡</span>
            <span>Request Studio</span>
          </button>
          <button
            type="button"
            className="btn dash-action-btn dash-download-btn"
            onClick={onOpenDownload}
            title="Download Pulse Desktop App for macOS (.dmg, .zip) or Windows (.zip, .exe)"
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Download Desktop</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      {overviewStyle ? (
        <DashboardOverview
          style={overviewStyle}
          collections={collections}
          history={history}
          passed={passedTests}
          activeEnvironment={activeEnv?.name}
          proxyOnline={proxyPing?.ok}
          totalRequests={totalRequests}
        />
      ) : (
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

      )}

      {/* Main Dashboard Layout (2 Columns) */}
      <div className="dash-content-grid">
        {/* Left Column: Collections Hub */}
        <div className="dash-col-main">
          {/* Section: Collections Hub */}
          <div className="dash-card">
            <div className="dash-card-header">
              <div>
                <h3 className="dash-card-title">Test Collections & Suites</h3>
                <div className="dash-card-subtitle">
                  Latest response per API · Green &lt;300 ms · Yellow 300–1,200 ms · Red &gt;1,200 ms
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {onLoadSamples && (
                  <button
                    className="btn sm"
                    onClick={onLoadSamples}
                    title="Load pre-configured sample test collections and environments"
                    style={{ display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <span>🧪</span> Samples
                  </button>
                )}
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
                  <p>No collections found in workspace.</p>
                  {onLoadSamples && (
                    <button className="btn primary sm" onClick={onLoadSamples} style={{ marginTop: 8 }}>
                      🧪 Load Sample Test Suite & Environments
                    </button>
                  )}
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
                        {reqs.slice(0, 5).map((r) => renderRequest(col.id, r))}
                        {reqs.length > 5 && (
                          <details className="more-api-requests">
                            <summary>Show {reqs.length - 5} more</summary>
                            <div className="col-request-pills">
                              {reqs.slice(5).map((r) => renderRequest(col.id, r))}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })
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
                  <button
                    key={h.id}
                    type="button"
                    className="history-stream-row"
                    onClick={() => setSelectedRun(h)}
                    title="View request result"
                  >
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
                    <RequestLatency run={h} />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <dialog
        ref={historyDialog}
        className="modal history-response-dialog"
        aria-labelledby="history-response-title"
        onClose={() => setSelectedRun(null)}
      >
        {selectedRun && (
          <>
            <div className="dash-card-header">
              <h3 id="history-response-title">Request result</h3>
              <button className="btn sm" type="button" onClick={() => historyDialog.current?.close()}>
                Close
              </button>
            </div>
            <p className="history-response-url">{selectedRun.method} {selectedRun.url}</p>
            {selectedRun.response ? (
              <>
                {selectedRun.responseTruncated && <p className="muted">Showing the first 16,000 characters saved in history.</p>}
                <ResponsePane response={selectedRun.response} sending={false} />
              </>
            ) : (
              <p className="muted">
                {selectedRun.status ? `HTTP ${selectedRun.status}` : "No response"} · {selectedRun.time} ms.
                Response details were not saved for this run.
              </p>
            )}
          </>
        )}
      </dialog>

    </div>
  );
}
