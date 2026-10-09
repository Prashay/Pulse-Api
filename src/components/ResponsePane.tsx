import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { ProxyResponse } from "../types";
import { formatBytes, prettyBody } from "../request";

type RespTab = "body" | "headers" | "tests";

interface Props {
  response: ProxyResponse | null;
  sending: boolean;
}

function highlightMatch(text: string, query: string, caseSensitive: boolean): React.ReactNode {
  if (!query) return text;
  try {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, caseSensitive ? "g" : "gi");
    const parts = text.split(regex);
    if (parts.length === 1) return text;
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="resp-match-subtle">
          {part}
        </mark>
      ) : (
        part
      )
    );
  } catch {
    return text;
  }
}

export function ResponsePane({ response, sending }: Props) {
  const [tab, setTab] = useState<RespTab>("body");
  const [pretty, setPretty] = useState(true);
  const [copied, setCopied] = useState(false);

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeMatchRef = useRef<HTMLElement | null>(null);

  const isMac = typeof navigator !== "undefined" && (navigator.platform?.includes("Mac") || navigator.userAgent?.includes("Mac"));
  const shortcutLabel = isMac ? "⌘F" : "Ctrl+F";

  const testResults = response?.testResults || [];
  const scriptLogs = response?.scriptLogs || [];
  const passCount = testResults.filter((t) => t.passed).length;
  const failCount = testResults.length - passCount;

  const contentType = response?.headers["content-type"] || response?.headers["Content-Type"] || "";
  const body = useMemo(() => {
    if (!response) return "";
    return pretty ? prettyBody(response.body, contentType) : response.body;
  }, [response, pretty, contentType]);

  // Keyboard shortcut (Ctrl+F / Cmd+F) to toggle and focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        if (!response || sending) return;

        const activeEl = document.activeElement as HTMLElement | null;
        // Do not intercept if user is typing inside Request Pane
        if (activeEl && activeEl.closest(".request-pane")) {
          return;
        }

        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }, 30);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [response, sending]);

  // When search bar opens, auto-focus input
  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  }, [searchOpen]);

  // Reset match index when query, sensitivity, or body text changes
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchTerm, caseSensitive, body]);

  // Calculate matches and highlight segments for body
  const { bodyElements, matchCount } = useMemo(() => {
    if (!body) {
      return { bodyElements: null, matchCount: 0 };
    }
    const query = searchTerm; // Do NOT trim, allows searching exact spaces and formatted keys
    if (!searchOpen || !query) {
      return { bodyElements: body, matchCount: 0 };
    }

    const flags = caseSensitive ? "g" : "gi";
    let regex: RegExp;
    try {
      regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
    } catch {
      return { bodyElements: body, matchCount: 0 };
    }

    const matches: { start: number; end: number }[] = [];
    let m: RegExpExecArray | null;
    const MAX_MATCHES = 1500;

    while ((m = regex.exec(body)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length });
      if (m.index === regex.lastIndex) regex.lastIndex++;
      if (matches.length >= MAX_MATCHES) break;
    }

    if (matches.length === 0) {
      return { bodyElements: body, matchCount: 0 };
    }

    const segments: React.ReactNode[] = [];
    let lastIndex = 0;

    matches.forEach((match, idx) => {
      if (match.start > lastIndex) {
        segments.push(body.slice(lastIndex, match.start));
      }
      const isCurrent = idx === currentMatchIndex;
      segments.push(
        <mark
          key={idx}
          ref={isCurrent ? (activeMatchRef as any) : undefined}
          className={`resp-match ${isCurrent ? "resp-match-current" : ""}`}
        >
          {body.slice(match.start, match.end)}
        </mark>
      );
      lastIndex = match.end;
    });

    if (lastIndex < body.length) {
      segments.push(body.slice(lastIndex));
    }

    return { bodyElements: segments, matchCount: matches.length };
  }, [body, searchTerm, caseSensitive, searchOpen, currentMatchIndex]);

  // Scroll active match into view
  useEffect(() => {
    if (searchOpen && matchCount > 0 && activeMatchRef.current) {
      activeMatchRef.current.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "smooth",
      });
    }
  }, [currentMatchIndex, matchCount, searchOpen]);

  const handleNextMatch = useCallback(() => {
    if (matchCount <= 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matchCount);
  }, [matchCount]);

  const handlePrevMatch = useCallback(() => {
    if (matchCount <= 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matchCount) % matchCount);
  }, [matchCount]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrevMatch();
      } else {
        handleNextMatch();
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      handleNextMatch();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      handlePrevMatch();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSearchOpen(false);
    }
  };

  // Filtered Headers
  const filteredHeaders = useMemo(() => {
    if (!response?.headers) return [];
    const entries = Object.entries(response.headers);
    if (!searchOpen || !searchTerm) return entries;
    const q = caseSensitive ? searchTerm : searchTerm.toLowerCase();
    return entries.filter(([k, v]) => {
      const keyStr = caseSensitive ? k : k.toLowerCase();
      const valStr = caseSensitive ? String(v) : String(v).toLowerCase();
      return keyStr.includes(q) || valStr.includes(q);
    });
  }, [response?.headers, searchOpen, searchTerm, caseSensitive]);

  // Filtered Tests & Logs
  const filteredTests = useMemo(() => {
    if (!testResults) return [];
    if (!searchOpen || !searchTerm) return testResults;
    const q = caseSensitive ? searchTerm : searchTerm.toLowerCase();
    return testResults.filter((t) => {
      const name = caseSensitive ? t.name : t.name.toLowerCase();
      const err = caseSensitive ? t.error || "" : (t.error || "").toLowerCase();
      return name.includes(q) || err.includes(q);
    });
  }, [testResults, searchOpen, searchTerm, caseSensitive]);

  const filteredLogs = useMemo(() => {
    if (!scriptLogs) return [];
    if (!searchOpen || !searchTerm) return scriptLogs;
    const q = caseSensitive ? searchTerm : searchTerm.toLowerCase();
    return scriptLogs.filter((line) => {
      const l = caseSensitive ? line : line.toLowerCase();
      return l.includes(q);
    });
  }, [scriptLogs, searchOpen, searchTerm, caseSensitive]);

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

  const searchPlaceholder =
    tab === "body"
      ? "Find in response body... (Enter: Next, Shift+Enter: Prev)"
      : tab === "headers"
        ? "Filter headers by name or value..."
        : "Filter tests & script logs...";

  let searchCountLabel: string | null = null;
  if (searchTerm) {
    if (tab === "body") {
      searchCountLabel =
        matchCount > 0
          ? `${currentMatchIndex + 1} of ${matchCount}${matchCount >= 1500 ? "+" : ""}`
          : "No matches";
    } else if (tab === "headers") {
      searchCountLabel = `${filteredHeaders.length} of ${Object.keys(response?.headers || {}).length} headers`;
    } else if (tab === "tests") {
      searchCountLabel = `${filteredTests.length} of ${testResults.length} tests`;
    }
  }

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
            <button
              className={`btn sm ghost ${searchOpen ? "active" : ""}`}
              onClick={() => setSearchOpen((prev) => !prev)}
              title={`Find in response (${shortcutLabel})`}
            >
              🔍 Search
            </button>
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

      {response && searchOpen && (
        <div className="resp-search-bar">
          <div className="resp-search-input-wrap">
            <span className="resp-search-icon">🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={searchPlaceholder}
              className="resp-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                className="resp-search-btn-clear"
                onClick={() => setSearchTerm("")}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="button"
            className={`resp-search-toggle-btn ${caseSensitive ? "active" : ""}`}
            onClick={() => setCaseSensitive((prev) => !prev)}
            title={caseSensitive ? "Match case: ON" : "Match case: OFF"}
          >
            Aa
          </button>
          {searchCountLabel && <div className="resp-search-count">{searchCountLabel}</div>}
          {tab === "body" && (
            <div className="resp-search-nav">
              <button
                type="button"
                className="resp-search-nav-btn"
                onClick={handlePrevMatch}
                disabled={matchCount === 0}
                title="Previous match (Shift+Enter or ↑)"
              >
                ▲
              </button>
              <button
                type="button"
                className="resp-search-nav-btn"
                onClick={handleNextMatch}
                disabled={matchCount === 0}
                title="Next match (Enter or ↓)"
              >
                ▼
              </button>
            </div>
          )}
          <button
            type="button"
            className="resp-search-close-btn"
            onClick={() => setSearchOpen(false)}
            title="Close search (Esc)"
          >
            ✕
          </button>
        </div>
      )}

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
              <span className="shortcut-chip"><kbd>{shortcutLabel}</kbd> Search</span>
            </div>
          </div>
        )}
        {!sending && response && tab === "body" && (
          <pre className="resp-pre">{bodyElements || "(empty)"}</pre>
        )}
        {!sending && response && tab === "headers" && (
          <div className="resp-headers-wrapper">
            {Object.keys(response.headers).length === 0 ? (
              <div className="empty">No response headers</div>
            ) : filteredHeaders.length === 0 ? (
              <div className="empty" style={{ padding: "28px 16px", textAlign: "center" }}>
                No headers matching "{searchTerm}"
              </div>
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
                    {filteredHeaders.map(([k, v]) => (
                      <tr key={k}>
                        <td className="resp-header-name">
                          {searchTerm.trim() ? highlightMatch(k, searchTerm, caseSensitive) : k}
                        </td>
                        <td className="resp-header-value">
                          {searchTerm.trim() ? highlightMatch(String(v), searchTerm, caseSensitive) : v}
                        </td>
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
                    {filteredTests.length === 0 ? (
                      <div className="empty" style={{ padding: "20px 16px", textAlign: "center" }}>
                        No test assertions matching "{searchTerm}"
                      </div>
                    ) : (
                      filteredTests.map((t, idx) => (
                        <div key={idx} className={`test-item ${t.passed ? "passed" : "failed"}`}>
                          <div className="test-item-header">
                            <span className="test-icon">{t.passed ? "✓ PASS" : "✕ FAIL"}</span>
                            <span className="test-name">
                              {searchTerm.trim() ? highlightMatch(t.name, searchTerm, caseSensitive) : t.name}
                            </span>
                          </div>
                          {!t.passed && t.error && (
                            <div className="test-error-msg">
                              {searchTerm.trim() ? highlightMatch(t.error, searchTerm, caseSensitive) : t.error}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
                {scriptLogs.length > 0 && (
                  <div className="script-logs-section">
                    <div className="script-logs-header">Console Output / Logs:</div>
                    <pre className="script-logs-pre">
                      {filteredLogs.length === 0 ? (
                        <span className="muted">No console logs matching "{searchTerm}"</span>
                      ) : searchTerm.trim() ? (
                        filteredLogs.map((line, idx) => (
                          <div key={idx}>{highlightMatch(line, searchTerm, caseSensitive)}</div>
                        ))
                      ) : (
                        scriptLogs.join("\n")
                      )}
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


