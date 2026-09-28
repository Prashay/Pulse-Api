import { useEffect, useState, type FC } from "react";

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownloadStarted?: (os: string, format: string) => void;
}

type OSType = "mac" | "windows";

interface DownloadOption {
  format: string;
  badge: string;
  name: string;
  filename: string;
  description: string;
  architecture: string;
  url: string;
  recommended?: boolean;
  note?: string;
  sourceType: "drive" | "github";
}

const MAC_OPTIONS: DownloadOption[] = [
  {
    format: "dmg",
    badge: ".DMG",
    name: "Apple Disk Image (.dmg)",
    filename: "Pulse-API-Studio-Universal.dmg",
    description: "Standard macOS installer. Drag and drop into your Applications folder.",
    architecture: "Universal (Apple Silicon M1/M2/M3/M4 & Intel)",
    url: "https://github.com/Prashay/Pulse-Api/releases/latest/download/Pulse-API-Studio-Universal.dmg",
    recommended: true,
    note: "Mount the .dmg file and drag Pulse API Studio into Applications.",
    sourceType: "github",
  },
  {
    format: "zip",
    badge: ".ZIP",
    name: "macOS Archive (.zip)",
    filename: "Pulse-API-Studio-Universal.zip",
    description: "Compressed portable package for macOS without mounting a disk image.",
    architecture: "Universal (Apple Silicon & Intel)",
    url: "https://github.com/Prashay/Pulse-Api/releases/latest/download/Pulse-API-Studio-Universal.zip",
    recommended: false,
    note: "Extract the zip archive and double-click Pulse API Studio to run directly.",
    sourceType: "github",
  },
];

const WINDOWS_OPTIONS: DownloadOption[] = [
  {
    format: "zip",
    badge: ".ZIP",
    name: "Windows Portable Archive (.zip)",
    filename: "pulse.zip",
    description: "Instant portable package — follows the standard direct download process.",
    architecture: "Windows 10 / 11 (64-bit)",
    url: "https://drive.usercontent.google.com/download?id=19j8N3pDuqN0C4uWIcdV29FT7oM9FR0hw&export=download&authuser=0",
    recommended: true,
    note: "Extract pulse.zip to any directory and launch Pulse.exe without installation.",
    sourceType: "drive",
  },
  {
    format: "exe",
    badge: ".EXE",
    name: "Windows Setup Installer (.exe)",
    filename: "Pulse-API-Studio-Setup.exe",
    description: "Full NSIS desktop installer with Start Menu and Desktop shortcuts.",
    architecture: "Windows 10 / 11 (64-bit)",
    url: "https://github.com/Prashay/Pulse-Api/releases/latest/download/Pulse-API-Studio-Setup.exe",
    recommended: false,
    note: "Run setup executable to install Pulse API Studio into standard Program Files.",
    sourceType: "github",
  },
];

export const DownloadModal: FC<DownloadModalProps> = ({ isOpen, onClose, onDownloadStarted }) => {
  const [selectedOS, setSelectedOS] = useState<OSType>("windows");
  const [detectedOS, setDetectedOS] = useState<OSType>("windows");
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [releaseStatus, setReleaseStatus] = useState<"checking" | "available" | "pending">("checking");
  const [showPendingHelp, setShowPendingHelp] = useState<string | null>(null);

  // Check if GitHub releases are published
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    fetch("https://api.github.com/repos/Prashay/Pulse-Api/releases/latest")
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (!isMounted) return;
        if (data && data.assets && data.assets.length > 0) {
          setReleaseStatus("available");
        } else {
          setReleaseStatus("pending");
        }
      })
      .catch(() => {
        if (isMounted) setReleaseStatus("pending");
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Auto-detect client platform
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const ua = (navigator.userAgent || navigator.platform || "").toLowerCase();
      if (ua.includes("mac") || ua.includes("iphone") || ua.includes("ipad") || ua.includes("darwin")) {
        setSelectedOS("mac");
        setDetectedOS("mac");
      } else {
        setSelectedOS("windows");
        setDetectedOS("windows");
      }
    }
  }, []);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showPendingHelp) {
          setShowPendingHelp(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose, showPendingHelp]);

  if (!isOpen) return null;

  const currentOptions = selectedOS === "mac" ? MAC_OPTIONS : WINDOWS_OPTIONS;

  const handleDownloadClick = (e: React.MouseEvent, opt: DownloadOption) => {
    if (opt.sourceType === "github" && releaseStatus === "pending") {
      e.preventDefault();
      setShowPendingHelp(opt.format);
      return;
    }
    if (onDownloadStarted) {
      onDownloadStarted(selectedOS, opt.format);
    }
  };

  const handleCopyLink = async (url: string, format: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedFormat(format);
      setTimeout(() => setCopiedFormat(null), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="modal-backdrop download-modal-backdrop" onClick={onClose}>
      <div
        className="modal download-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-modal-title"
      >
        {/* Header */}
        <div className="download-modal-header">
          <div className="download-header-icon-wrap">
            <svg
              width="22"
              height="22"
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
          </div>
          <div className="download-header-titles">
            <h2 id="download-modal-title" className="download-modal-title">
              Download Pulse API Studio
            </h2>
            <p className="download-modal-subtitle">
              Select your operating system and preferred package format to get started
            </p>
          </div>
          <button
            className="download-close-btn"
            onClick={onClose}
            aria-label="Close download dialog"
            title="Close (Esc)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* OS Selector Tabs */}
        <div className="download-os-tabs" role="tablist" aria-label="Select Operating System">
          {/* macOS Tab */}
          <button
            type="button"
            role="tab"
            aria-selected={selectedOS === "mac"}
            className={`download-os-tab ${selectedOS === "mac" ? "active" : ""}`}
            onClick={() => setSelectedOS("mac")}
          >
            <span className="os-tab-icon">
              {/* Apple icon */}
              <svg width="16" height="16" viewBox="0 0 170 170" fill="currentColor">
                <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.6-7.7-11.7-13.98-5.65-8.6-10.05-18.47-13.2-29.62-3.15-11.14-4.73-21.72-4.73-31.74 0-14.45 3.65-26.4 10.96-35.85 7.31-9.45 16.53-14.28 27.67-14.49 4.35 0 9.29 1.13 14.81 3.39 5.52 2.26 9.4 3.44 11.64 3.55 1.95 0 5.86-1.22 11.72-3.66 5.86-2.44 10.74-3.52 14.65-3.23 13.04.65 23.33 5.43 30.87 14.34-11.3 6.85-16.85 16.53-16.65 29.04.22 9.78 4 18.06 11.34 24.84 5.22 4.9 11.19 8.1 17.91 9.6-2.61 7.6-5.87 15.11-9.78 22.52zM119.22 33.15c0-7.39 2.61-14.3 7.83-20.73 5.22-6.43 11.63-10.43 19.23-12.01.22 1.09.33 2.07.33 2.94 0 7.39-2.72 14.4-8.16 21.03-5.44 6.63-12.01 10.49-19.72 11.58-.22-.98-.33-1.87-.33-2.68z" />
              </svg>
            </span>
            <div className="os-tab-text">
              <span className="os-tab-title">macOS</span>
              <span className="os-tab-desc">Apple Silicon & Intel</span>
            </div>
            {detectedOS === "mac" && <span className="os-detected-badge">Detected</span>}
          </button>

          {/* Windows Tab */}
          <button
            type="button"
            role="tab"
            aria-selected={selectedOS === "windows"}
            className={`download-os-tab ${selectedOS === "windows" ? "active" : ""}`}
            onClick={() => setSelectedOS("windows")}
          >
            <span className="os-tab-icon">
              {/* Windows icon */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.951-1.951" />
              </svg>
            </span>
            <div className="os-tab-text">
              <span className="os-tab-title">Windows</span>
              <span className="os-tab-desc">Win 10 & 11 (64-bit)</span>
            </div>
            {detectedOS === "windows" && <span className="os-detected-badge">Detected</span>}
          </button>
        </div>

        {/* Release Pending Notice on macOS */}
        {selectedOS === "mac" && releaseStatus === "pending" && (
          <div className="download-pending-notice">
            <div className="pending-notice-head">
              <span className="pending-notice-pill">Setup Required</span>
              <strong>macOS Builds will activate after GitHub Release</strong>
            </div>
            <p className="pending-notice-desc">
              Your Universal macOS packages (<code>.dmg</code> and <code>.zip</code>) are built in the cloud via GitHub Actions.
              Click below to run the build in 1 click:
            </p>
            <div className="pending-notice-actions">
              <a
                href="https://github.com/Prashay/Pulse-Api/actions/workflows/build-electron.yml"
                target="_blank"
                rel="noopener noreferrer"
                className="pending-action-btn"
              >
                <span>⚡ Run "Build Desktop Apps" on GitHub Actions</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>
          </div>
        )}

        {/* Download Options Grid */}
        <div className="download-cards-container">
          <div className="download-section-lead">
            {selectedOS === "mac" ? (
              <span>
                Available packages for <strong>macOS</strong> (Universal build for Apple Silicon & Intel):
              </span>
            ) : (
              <span>
                Available packages for <strong>Windows</strong> (64-bit):
              </span>
            )}
          </div>

          <div className="download-cards-grid">
            {currentOptions.map((opt) => (
              <div
                key={opt.format}
                className={`download-card ${opt.recommended ? "is-recommended" : ""}`}
              >
                <div className="download-card-header">
                  <div className="download-badge-group">
                    <span className={`download-format-badge format-${opt.format.toLowerCase()}`}>
                      {opt.badge}
                    </span>
                    {opt.recommended && (
                      <span className="download-recommended-badge">
                        {selectedOS === "windows" && opt.format === "zip"
                          ? "Current Process"
                          : "Recommended"}
                      </span>
                    )}
                  </div>
                  <span className="download-arch-pill">{opt.architecture}</span>
                </div>

                <div className="download-card-body">
                  <h3 className="download-card-title">{opt.name}</h3>
                  <p className="download-card-desc">{opt.description}</p>
                  <div className="download-card-meta">
                    <code className="download-filename">{opt.filename}</code>
                  </div>
                  {opt.note && <div className="download-card-instruction">{opt.note}</div>}
                </div>

                <div className="download-card-actions">
                  <a
                    href={opt.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="download-action-btn primary"
                    onClick={(e) => handleDownloadClick(e, opt)}
                    download={opt.filename}
                    title={`Download ${opt.filename}`}
                  >
                    <svg
                      width="15"
                      height="15"
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
                    <span>Download {opt.badge}</span>
                  </a>

                  <button
                    type="button"
                    className="download-action-btn copy-btn"
                    onClick={() => handleCopyLink(opt.url, opt.format)}
                    title="Copy direct download link"
                    aria-label="Copy direct download link"
                  >
                    {copiedFormat === opt.format ? (
                      <>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        <span>Copy URL</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Helpful hints and GitHub link */}
        <div className="download-modal-footer">
          <div className="download-security-tip">
            {selectedOS === "mac" ? (
              <p>
                <strong>macOS Tip:</strong> If macOS Gatekeeper alerts about an unverified developer,
                right-click (or Control-click) <code>Pulse API Studio.app</code> in your Applications
                folder and choose <strong>Open</strong>.
              </p>
            ) : (
              <p>
                <strong>Windows Tip:</strong> The <strong>.zip</strong> package requires no admin rights —
                simply extract and double-click <code>Pulse.exe</code>. The <strong>.exe</strong> setup creates
                automatic Desktop & Start menu shortcuts.
              </p>
            )}
          </div>

          <div className="download-github-note">
            <span>Looking for full release notes or previous builds?</span>
            <a
              href="https://github.com/Prashay/Pulse-Api/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="download-github-link"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span>GitHub Releases</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        </div>

        {/* Pending Help Dialog */}
        {showPendingHelp && (
          <div className="pending-help-backdrop" onClick={() => setShowPendingHelp(null)}>
            <div className="pending-help-modal" onClick={(e) => e.stopPropagation()}>
              <div className="pending-help-icon">⚡</div>
              <h3 className="pending-help-title">macOS Release Not Yet Published</h3>
              <p className="pending-help-desc">
                The download link points to <strong>GitHub Releases</strong>, which has not been published yet on this repository.
              </p>
              <div className="pending-help-steps">
                <div className="pending-step-item">
                  <span className="step-circle">1</span>
                  <div className="step-content">
                    <strong>Open GitHub Actions</strong>
                    <span>Go to the <code>Build Desktop Apps</code> workflow.</span>
                  </div>
                </div>
                <div className="pending-step-item">
                  <span className="step-circle">2</span>
                  <div className="step-content">
                    <strong>Click "Run workflow"</strong>
                    <span>Select branch <code>main</code> and keep version <code>v1.0.0</code>.</span>
                  </div>
                </div>
                <div className="pending-step-item">
                  <span className="step-circle">3</span>
                  <div className="step-content">
                    <strong>Automatic Release Creation</strong>
                    <span>GitHub compiles the Universal DMG & ZIP in ~3 mins and publishes the files.</span>
                  </div>
                </div>
              </div>
              <div className="pending-help-buttons">
                <a
                  href="https://github.com/Prashay/Pulse-Api/actions/workflows/build-electron.yml"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="download-action-btn primary"
                >
                  Go to GitHub Actions
                </a>
                <a
                  href={currentOptions.find((o) => o.format === showPendingHelp)?.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="download-action-btn copy-btn"
                >
                  Open Link Anyway
                </a>
                <button
                  type="button"
                  className="download-action-btn copy-btn"
                  onClick={() => setShowPendingHelp(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
