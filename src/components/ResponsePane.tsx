import { useMemo, useState } from "react";
import type { ProxyResponse } from "../types";
import { formatBytes, prettyBody } from "../request";

type RespTab = "body" | "headers" | "tests";

interface Props {
  response: ProxyResponse | null;
  sending: boolean;
}

export function ResponsePane({ response, sending }: Props) {
  const [tab, setTab] = useState<RespTab>("body");
  const [pretty, setPretty] = useState(true);
  const [copied, setCopied] = useState(false);

  const testResults = response?.testResults || [];
  const scriptLogs = response?.scriptLogs || [];
  const passCount = testResults.filter((t) => t.passed).length;
  const failCount = testResults.length - passCount;

  const contentType = response?.headers["content-type"] || response?.headers["Content-Type"] || "";
  const body = useMemo(() => {
    if (!response) return "";
    return pretty ? prettyBody(response.body, contentType) : response.body;
  }, [response, pretty, contentType]);

  const statusClass = !response
    ? ""
    : response.error
      ? "status-err"
      : response.status >= 200 && response.status < 300
        ? "status-ok"
        : response.status >= 400
          ? "status-err"
          : "status-warn";

  const handleCopyBody = () => {
    if (!body) return;
    navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="pane response-pane">
      <div className="pane-tabs">
        <span className="resp-label">Response</span>
        <button className={`pane-tab ${tab === "body" ? "active" : ""}`} onClick={() => setTab("body")}>
          Body
        </button>
        <button className={`pane-tab ${tab === "headers" ? "active" : ""}`} onClick={() => setTab("headers")}>
          Headers
        </button>
        <button className={`pane-tab ${tab === "tests" ? "active" : ""}`} onClick={() => setTab("tests")}>
          Test Results {testResults.length > 0 ? `(${passCount}/${testResults.length})` : ""}
        </button>
        {response && (
          <div className="resp-status">
            {testResults.length > 0 && (
              <span className={`status-pill ${failCount > 0 ? "status-err" : "status-ok"}`}>
                {passCount}/{testResults.length} Tests
              </span>
            )}
            <span className={`status-pill ${statusClass}`}>
              {response.error ? response.statusText : `${response.status} ${response.statusText}`}
            </span>
            <span className="resp-meta-chip">⏱️ {response.time} ms</span>
            <span className="resp-meta-chip">📦 {formatBytes(response.size)}</span>
            {tab === "body" && (
              <button className="btn sm ghost" onClick={() => setPretty((p) => !p)} title="Toggle formatted JSON vs raw body">
                {pretty ? "Raw" : "Pretty"}
              </button>
            )}
            {tab === "body" && body && (
              <button className="btn sm ghost" onClick={handleCopyBody} title="Copy response body to clipboard">
                {copied ? "✓ Copied" : "Copy"}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="pane-body response-pane-body">
        {sending && (
          <div className="empty busy" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
            <div className="pulse-spinner" />
            <div>Dispatching HTTP request...</div>
          </div>
        )}
        {!sending && !response && (
          <div className="empty-hero">
            <div className="empty-hero-icon-box">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="empty-hero-title">Ready to Send Request</div>
            <div className="empty-hero-desc">Hit Send or press Enter to dispatch this request and inspect response data.</div>
            <div className="empty-hero-shortcuts">
              <span className="shortcut-chip"><kbd>Enter</kbd> Send</span>
              <span className="shortcut-chip"><kbd>Ctrl</kbd>+<kbd>S</kbd> Save</span>
            </div>
          </div>
        )}
        {!sending && response && tab === "body" && <pre className="resp-pre">{body || "(empty)"}</pre>}
        {!sending && response && tab === "headers" && (
          <div className="resp-headers-wrapper">
            {Object.keys(response.headers).length === 0 ? (
              <div className="empty">No response headers</div>
            ) : (
              <div className="resp-headers-card">
                <table className="resp-headers-table">
                  <thead>
                    <tr>
                      <th className="resp-th-name">Name</th>
                      <th className="resp-th-val">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(response.headers).map(([k, v]) => (
                      <tr key={k}>
                        <td className="resp-header-name">{k}</td>
                        <td className="resp-header-value">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {!sending && response && tab === "tests" && (
          <div className="tests-pane-content">
            {testResults.length === 0 && scriptLogs.length === 0 ? (
              <div className="empty" style={{ padding: "36px 16px", textAlign: "center" }}>
                <div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "14px" }}>No tests or script logs for this request</div>
                <div className="muted" style={{ fontSize: "12px", maxWidth: "440px", margin: "0 auto", lineHeight: "1.6" }}>
                  Go to the <b>Scripts</b> tab &gt; <b>After response</b> in the request panel to write assertions using <code>pm.test(...)</code> and <code>pm.expect(...)</code>.
                </div>
              </div>
            ) : (
              <>
                {testResults.length > 0 && (
                  <div className="tests-summary-bar">
                    <span className="tests-summary-title">Summary:</span>
                    <span className="tests-badge pass">{passCount} Passed</span>
                    {failCount > 0 && <span className="tests-badge fail">{failCount} Failed</span>}
                    <span className="tests-badge total">{testResults.length} Total</span>
                  </div>
                )}
                {testResults.length > 0 && (
                  <div className="tests-list">
                    {testResults.map((t, idx) => (
                      <div key={idx} className={`test-item ${t.passed ? "passed" : "failed"}`}>
                        <div className="test-item-header">
                          <span className="test-icon">{t.passed ? "✓ PASS" : "✕ FAIL"}</span>
                          <span className="test-name">{t.name}</span>
                        </div>
                        {!t.passed && t.error && (
                          <div className="test-error-msg">{t.error}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {scriptLogs.length > 0 && (
                  <div className="script-logs-section">
                    <div className="script-logs-header">Console Output / Logs:</div>
                    <pre className="script-logs-pre">
                      {scriptLogs.join("\n")}
                    </pre>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

