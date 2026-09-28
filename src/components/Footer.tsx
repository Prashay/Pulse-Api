import type { FC } from "react";

interface FooterProps {
  activeEnvName?: string | null;
  collectionsCount: number;
  requestsCount: number;
  viewMode: "dashboard" | "studio";
  onSwitchView?: (mode: "dashboard" | "studio") => void;
  consoleOpen?: boolean;
  onToggleConsole?: () => void;
  consoleLogsCount?: number;
  consoleErrorCount?: number;
}

export const Footer: FC<FooterProps> = ({
  activeEnvName,
  collectionsCount,
  requestsCount,
  viewMode,
  onSwitchView,
  consoleOpen,
  onToggleConsole,
  consoleLogsCount = 0,
  consoleErrorCount = 0,
}) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="app-footer" role="contentinfo" aria-label="Pulse API Studio Footer">
      {/* Left section: Engine status & active environment */}
      <div className="footer-left">
        <div className="footer-status-pill" title="Pulse API Proxy Engine is active">
          <span className="footer-status-dot" />
          <span>Proxy Online</span>
        </div>

        <span className="footer-sep">/</span>

        <span className="footer-env-pill" title={`Active Environment: ${activeEnvName ?? "None"}`}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
          <span>{activeEnvName || "No Environment"}</span>
        </span>

        {onToggleConsole && (
          <button
            className={`footer-console-btn ${consoleOpen ? "active" : ""}`}
            onClick={onToggleConsole}
            title="Toggle Pulse Console and Terminal (Network Logs, Details, CLI)"
            aria-label="Toggle Pulse Console"
          >
            <span className="footer-console-glyph">&gt;_</span>
            <span>Console</span>
            {consoleLogsCount > 0 && (
              <span className="footer-console-count">{consoleLogsCount}</span>
            )}
            {consoleErrorCount > 0 && (
              <span className="footer-console-err-count">{consoleErrorCount}</span>
            )}
          </button>
        )}

        {onSwitchView && (
          <button
            className="footer-view-pill"
            onClick={() => onSwitchView(viewMode === "dashboard" ? "studio" : "dashboard")}
            title={`Switch to ${viewMode === "dashboard" ? "Studio" : "Dashboard"}`}
          >
            {viewMode === "dashboard" ? "✦ View Studio" : "📊 View Dashboard"}
          </button>
        )}
      </div>

      {/* Center section: Designer & Developer attribution with @copyright */}
      <div className="footer-center">
        <div className="footer-credit-badge">
          <img src="./logo.png" alt="Pulse API Studio" className="footer-logo-img" />
          <span className="footer-credit-text">
            <span className="footer-credit-prefix">Design and Developed by </span>
            <strong className="footer-author-name">Prashant Jha</strong>
          </span>
          <span className="footer-dot">•</span>
          <span className="footer-copyright-tag">@copyright {currentYear}</span>
        </div>
      </div>

      {/* Right section: Stats, encoding & version */}
      <div className="footer-right">
        <span className="footer-stat-item">
          <strong>{collectionsCount}</strong> {collectionsCount === 1 ? "col" : "cols"}
        </span>
        <span className="footer-dot">•</span>
        <span className="footer-stat-item">
          <strong>{requestsCount}</strong> {requestsCount === 1 ? "req" : "reqs"}
        </span>
        <span className="footer-dot">•</span>
        <span className="footer-encoding">UTF-8</span>
        <span className="footer-badge-version">v1.0.0</span>
      </div>
    </footer>
  );
};
