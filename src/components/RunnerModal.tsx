import { useEffect, useMemo, useRef, useState } from "react";
import type { Collection, Environment, RunResult } from "../types";
import { METHOD_COLORS } from "../types";
import { collectRequests, formatBytes, interpolate, prettyBody, sendRequest } from "../request";
import { downloadJson } from "../importExport";

interface Props {
  collection: Collection;
  environments?: Environment[];
  env?: Environment | null;
  activeEnvId?: string | null;
  onSelectEnv?: (id: string | null) => void;
  onClose: () => void;
}

export function RunnerModal({
  collection,
  environments = [],
  env,
  activeEnvId,
  onSelectEnv,
  onClose,
}: Props) {
  const requests = useMemo(() => collectRequests(collection.children), [collection.children]);
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(
    () => activeEnvId ?? env?.id ?? (environments[0]?.id || null)
  );
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RunResult[]>([]);
  const [delay, setDelay] = useState(100);
  const [filter, setFilter] = useState<"all" | "passed" | "failed">("all");
  const [selectedResult, setSelectedResult] = useState<RunResult | null>(null);
  const stopRef = useRef(false);

  // Sync active environment
  const currentEnv = useMemo(() => {
    return environments.find((e) => e.id === selectedEnvId) ?? env ?? null;
  }, [environments, selectedEnvId, env]);

  const handleEnvChange = (newId: string | null) => {
    setSelectedEnvId(newId);
    onSelectEnv?.(newId);
  };

  useEffect(() => {
    stopRef.current = false;
    return () => {
      stopRef.current = true;
    };
  }, []);

  const run = async () => {
    setRunning(true);
    setResults([]);
    setSelectedResult(null);
    stopRef.current = false;
    const acc: RunResult[] = [];

    for (const req of requests) {
      if (stopRef.current) break;
      const resolvedUrl = interpolate(req.url, currentEnv, collection);
      try {
        const resp = await sendRequest(req, currentEnv, collection, undefined, {
          requestId: req.id,
        });
        const item: RunResult = {
          requestId: req.id,
          name: req.name,
          method: req.method,
          url: resp.outbound?.url || resolvedUrl,
          status: resp.status,
          statusText: resp.statusText,
          time: resp.time,
          size: resp.size,
          ok: resp.ok,
          error: resp.error,
          body: resp.body,
          headers: resp.headers,
        };
        acc.push(item);
      } catch (err) {
        acc.push({
          requestId: req.id,
          name: req.name,
          method: req.method,
          url: resolvedUrl,
          status: 0,
          statusText: "Network/Local Error",
          time: 0,
          size: 0,
          ok: false,
          error: true,
          body: err instanceof Error ? err.message : String(err),
        });
      }
      setResults([...acc]);
      if (delay > 0) await sleep(delay);
    }
    setRunning(false);
  };

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const totalTime = results.reduce((acc, r) => acc + r.time, 0);
  const pct = requests.length ? Math.round((results.length / requests.length) * 100) : 0;

  const filteredResults = useMemo(() => {
    if (filter === "passed") return results.filter((r) => r.ok);
    if (filter === "failed") return results.filter((r) => !r.ok);
    return results;
  }, [results, filter]);

  const exportReport = () => {
    const report = {
      collection: collection.name,
      environment: currentEnv?.name ?? "No Environment",
      timestamp: new Date().toISOString(),
      summary: {
        total: requests.length,
        executed: results.length,
        passed,
        failed,
        totalTimeMs: totalTime,
      },
      results: results.map((r) => ({
        name: r.name,
        method: r.method,
        url: r.url,
        status: r.status,
        statusText: r.statusText,
        timeMs: r.time,
        sizeBytes: r.size,
        ok: r.ok,
        error: r.error,
        responsePreview: r.body.slice(0, 1000),
      })),
    };
    downloadJson(`${collection.name.toLowerCase().replace(/\s+/g, "-")}-test-run.json`, report);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal runner-modal-large"
        style={{ width: "min(880px, 95vw)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0 }}>Collection Runner — {collection.name}</h2>
            <div className="muted" style={{ marginTop: 4 }}>
              Execute and validate API collections against your local or remote environments
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 16 }}>
            ✕
          </button>
        </div>

        {/* Configuration Row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            gap: 12,
            marginTop: 14,
            padding: 12,
            background: "var(--bg)",
            borderRadius: 6,
            border: "1px solid var(--border)",
            alignItems: "center",
          }}
        >
          <div className="field" style={{ margin: 0 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)" }}>
              Target Environment
            </label>
            <select
              value={selectedEnvId ?? ""}
              disabled={running}
              onChange={(e) => handleEnvChange(e.target.value || null)}
              style={{ minWidth: 200 }}
            >
              <option value="">No Environment (Raw URLs)</option>
              {environments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.variables.filter((v) => v.enabled && v.key).length} vars)
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ margin: 0, width: 140 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)" }}>
              Delay between (ms)
            </label>
            <input
              type="number"
              min={0}
              step={50}
              value={delay}
              disabled={running}
              onChange={(e) => setDelay(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <div style={{ alignSelf: "flex-end" }}>
            {running ? (
              <button
                className="btn danger"
                style={{ padding: "7px 16px" }}
                onClick={() => {
                  stopRef.current = true;
                }}
              >
                ⏹ Stop Run
              </button>
            ) : (
              <button
                className="btn primary"
                style={{ padding: "7px 18px", fontWeight: 700 }}
                onClick={run}
                disabled={requests.length === 0}
              >
                ▶ Run {requests.length} Request{requests.length === 1 ? "" : "s"}
              </button>
            )}
          </div>
        </div>

        {/* Active Environment Variables Preview */}
        {currentEnv && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "var(--text-dim)",
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 600 }}>Active Env:</span>
            {currentEnv.variables
              .filter((v) => v.enabled && v.key)
              .slice(0, 4)
              .map((v) => (
                <span
                  key={v.id}
                  style={{
                    background: "var(--bg-3)",
                    padding: "2px 6px",
                    borderRadius: 4,
                    border: "1px solid var(--border-soft)",
                    fontFamily: "var(--mono)",
                  }}
                >
                  <span style={{ color: "var(--info)" }}>{v.key}</span>=
                  <span style={{ color: "var(--text)" }}>
                    {v.value.length > 28 ? v.value.slice(0, 25) + "..." : v.value}
                  </span>
                </span>
              ))}
            {currentEnv.variables.filter((v) => v.enabled && v.key).length > 4 && (
              <span className="muted">
                +{currentEnv.variables.filter((v) => v.enabled && v.key).length - 4} more
              </span>
            )}
          </div>
        )}

        {/* Progress Bar & Stats */}
        <div style={{ marginTop: 14 }}>
          <div className="progress">
            <div
              style={{
                width: `${pct}%`,
                background: failed > 0 ? "linear-gradient(90deg, var(--ok), var(--err))" : "var(--accent)",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 12,
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ color: "var(--text-dim)" }}>
                Executed: <b>{results.length}</b>/{requests.length}
              </span>
              <span style={{ color: "var(--ok)" }}>
                Passed: <b>{passed}</b>
              </span>
              <span style={{ color: failed > 0 ? "var(--err)" : "var(--text-mute)" }}>
                Failed: <b>{failed}</b>
              </span>
              {totalTime > 0 && (
                <span style={{ color: "var(--text-mute)" }}>
                  Duration: <b>{totalTime} ms</b>
                </span>
              )}
            </div>

            {results.length > 0 && (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className={`btn sm ${filter === "all" ? "primary" : "ghost"}`}
                  onClick={() => setFilter("all")}
                >
                  All ({results.length})
                </button>
                <button
                  className={`btn sm ${filter === "passed" ? "primary" : "ghost"}`}
                  onClick={() => setFilter("passed")}
                >
                  Passed ({passed})
                </button>
                <button
                  className={`btn sm ${filter === "failed" ? "primary" : "ghost"}`}
                  onClick={() => setFilter("failed")}
                >
                  Failed ({failed})
                </button>
                <button className="btn sm ghost" onClick={exportReport} title="Export Test Results">
                  Export JSON
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Results List */}
        <div
          style={{
            maxHeight: 280,
            overflowY: "auto",
            border: "1px solid var(--border)",
            borderRadius: 6,
            background: "var(--bg)",
          }}
        >
          <table className="runner-table" style={{ margin: 0 }}>
            <thead>
              <tr style={{ background: "var(--bg-3)", position: "sticky", top: 0, zIndex: 2 }}>
                <th style={{ width: 65 }}>Method</th>
                <th>Request & URL</th>
                <th style={{ width: 85 }}>Status</th>
                <th style={{ width: 70 }}>Time</th>
                <th style={{ width: 75 }}>Size</th>
                <th style={{ width: 60 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--text-mute)" }}>
                    {running
                      ? "Running test suite..."
                      : results.length === 0
                      ? "Ready to run. Click 'Run Requests' to execute."
                      : "No results match the selected filter."}
                  </td>
                </tr>
              ) : (
                filteredResults.map((r, i) => {
                  const isSelected = selectedResult?.requestId === r.requestId && selectedResult.time === r.time;
                  return (
                    <tr
                      key={r.requestId + "-" + i}
                      onClick={() => setSelectedResult(isSelected ? null : r)}
                      style={{
                        cursor: "pointer",
                        background: isSelected ? "var(--bg-active)" : undefined,
                      }}
                    >
                      <td>
                        <span className={`method ${METHOD_COLORS[r.method]}`}>{r.method}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-dim)",
                            fontFamily: "var(--mono)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 380,
                          }}
                          title={r.url}
                        >
                          {r.url}
                        </div>
                      </td>
                      <td>
                        <span
                          className={r.error ? "status-err" : r.ok ? "status-ok" : "status-warn"}
                          style={{ fontWeight: 700 }}
                        >
                          {r.error ? (r.status || "ERR") : r.status} {r.statusText}
                        </span>
                      </td>
                      <td style={{ fontFamily: "var(--mono)" }}>{r.time} ms</td>
                      <td>{formatBytes(r.size)}</td>
                      <td>
                        <button
                          className="btn sm ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedResult(isSelected ? null : r);
                          }}
                        >
                          {isSelected ? "Hide" : "View"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Selected Result Details Drawer */}
        {selectedResult && (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={`method ${METHOD_COLORS[selectedResult.method]}`}>
                  {selectedResult.method}
                </span>
                <span style={{ fontWeight: 600 }}>{selectedResult.name}</span>
                <span
                  className={
                    selectedResult.error ? "status-err" : selectedResult.ok ? "status-ok" : "status-warn"
                  }
                  style={{ fontWeight: 700, fontSize: 12 }}
                >
                  {selectedResult.status} {selectedResult.statusText}
                </span>
              </div>
              <button className="icon-btn" onClick={() => setSelectedResult(null)}>
                ✕
              </button>
            </div>

            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--mono)",
                color: "var(--info)",
                marginBottom: 6,
                wordBreak: "break-all",
              }}
            >
              Target: {selectedResult.url}
            </div>

            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
              Response Body Preview ({formatBytes(selectedResult.size)}):
            </div>
            <pre
              style={{
                margin: 0,
                padding: 8,
                background: "var(--bg-3)",
                border: "1px solid var(--border-soft)",
                borderRadius: 4,
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--text)",
                maxHeight: 120,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {prettyBody(selectedResult.body)}
            </pre>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onClose} disabled={running}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
