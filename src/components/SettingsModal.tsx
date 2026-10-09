import { useEffect, useState, type FC } from "react";
import type { ThemeMode } from "../types";

export interface FontSettings {
  fontSize: number; // in px, e.g. 13
  fontFamily: string;
  codeFontSize: number;
  codeFontFamily: string;
}

export interface ThemePreset {
  id: ThemeMode;
  name: string;
  badge: string;
  desc: string;
  bg: string;
  sidebarBg: string;
  cardBg: string;
  accent: string;
  textColor: string;
  textMute: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "blue",
    name: "Midnight Blue",
    badge: "DEFAULT",
    desc: "Deep tech aesthetics with electric blue accents and high-contrast text",
    bg: "#070a12",
    sidebarBg: "#0d1322",
    cardBg: "#141c30",
    accent: "#3b82f6",
    textColor: "#ffffff",
    textMute: "#94a3b8",
  },
  {
    id: "dark",
    name: "Deep Charcoal",
    badge: "BRUNO DARK",
    desc: "Modern neutral dark palette with violet accents and minimal eye strain",
    bg: "#08090d",
    sidebarBg: "#0e1017",
    cardBg: "#151822",
    accent: "#8b5cf6",
    textColor: "#ffffff",
    textMute: "#9ca3af",
  },
  {
    id: "light",
    name: "Crisp Clean",
    badge: "BRUNO LIGHT",
    desc: "Bright daylight layout with high-contrast text, slate borders, and crisp blue accents",
    bg: "#f8fafc",
    sidebarBg: "#ffffff",
    cardBg: "#ffffff",
    accent: "#2563eb",
    textColor: "#0f172a",
    textMute: "#64748b",
  },
];

export const FONT_FAMILY_PRESETS = [
  {
    id: "sans",
    name: "Plus Jakarta Sans & Inter (Default — Razor Sharp UI)",
    value: '"Plus Jakarta Sans", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    sample: "Crisp, balanced high-definition UI typography",
  },
  {
    id: "jetbrains",
    name: "JetBrains Mono (Developer Monospace)",
    value: '"JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace',
    sample: "Pixel-perfect modern developer monospace",
  },
  {
    id: "cascadia",
    name: "Cascadia Code / Consolas",
    value: '"Cascadia Code", Consolas, monospace',
    sample: "Clean Windows developer monospace",
  },
  {
    id: "fira",
    name: "Fira Code (Developer)",
    value: '"Fira Code", "Source Code Pro", Consolas, monospace',
    sample: "Monospace font with code ligatures",
  },
  {
    id: "roboto",
    name: "Roboto (Google Style)",
    value: '"Roboto", -apple-system, BlinkMacSystemFont, sans-serif',
    sample: "Clean geometric sans-serif",
  },
  {
    id: "geist",
    name: "Geist & System",
    value: '"Geist", "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    sample: "Crisp technical typography",
  },
  {
    id: "apple",
    name: "San Francisco (Apple Style)",
    value: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
    sample: "Native macOS & iOS typography",
  },
  {
    id: "segoe",
    name: "Segoe UI (Windows Fluent)",
    value: '"Segoe UI", -apple-system, Roboto, Tahoma, sans-serif',
    sample: "Standard Windows typography",
  },
];

export const CODE_FONT_PRESETS = [
  {
    id: "jetbrains-mono",
    name: "JetBrains Mono (Default — Razor Sharp)",
    value: '"JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace',
  },
  {
    id: "cascadia",
    name: "Cascadia Code",
    value: '"Cascadia Code", Consolas, "Courier New", monospace',
  },
  {
    id: "fira-code",
    name: "Fira Code",
    value: '"Fira Code", "Source Code Pro", Consolas, monospace',
  },
  {
    id: "system-mono",
    name: "System Monospace",
    value: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
];

export type PanelLayoutMode = "response-bottom" | "response-right";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: FontSettings;
  onUpdateSettings: (settings: FontSettings) => void;
  theme?: ThemeMode;
  onUpdateTheme?: (theme: ThemeMode) => void;
  panelLayout?: PanelLayoutMode;
  onUpdatePanelLayout?: (layout: PanelLayoutMode) => void;
  onResetPanelSizes?: () => void;
}

export const SettingsModal: FC<Props> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  theme = "blue",
  onUpdateTheme,
  panelLayout = "response-bottom",
  onUpdatePanelLayout,
  onResetPanelSizes,
}) => {
  const [localSettings, setLocalSettings] = useState<FontSettings>(settings);
  const [activeTab, setActiveTab] = useState<"theme" | "typography" | "layout" | "network">("theme");
  const [resetNotif, setResetNotif] = useState(false);
  const [panelResetNotif, setPanelResetNotif] = useState(false);
  const [requestTimeout, setRequestTimeout] = useState<number>(() => {
    try {
      const stored = localStorage.getItem("pulse_request_timeout");
      if (stored !== null && stored !== "") {
        const val = Number(stored);
        if (!isNaN(val)) return Math.max(0, val);
      }
    } catch {}
    return 0;
  });

  const handleTimeoutChange = (val: number) => {
    const next = Math.max(0, val);
    setRequestTimeout(next);
    localStorage.setItem("pulse_request_timeout", String(next));
  };

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const update = (patch: Partial<FontSettings>) => {
    const updated = { ...localSettings, ...patch };
    setLocalSettings(updated);
    onUpdateSettings(updated);
  };

  const changeFontSize = (delta: number) => {
    const next = Math.max(11, Math.min(22, localSettings.fontSize + delta));
    update({ fontSize: next });
  };

  const changeCodeFontSize = (delta: number) => {
    const next = Math.max(10, Math.min(24, localSettings.codeFontSize + delta));
    update({ codeFontSize: next });
  };

  const resetDefaults = () => {
    const defaults: FontSettings = {
      fontSize: 12,
      fontFamily: FONT_FAMILY_PRESETS[0].value,
      codeFontSize: 12,
      codeFontFamily: CODE_FONT_PRESETS[0].value,
    };
    setLocalSettings(defaults);
    onUpdateSettings(defaults);
    setResetNotif(true);
    setTimeout(() => setResetNotif(false), 2200);
  };

  const handleResetPanels = () => {
    if (onResetPanelSizes) {
      onResetPanelSizes();
      setPanelResetNotif(true);
      setTimeout(() => setPanelResetNotif(false), 2000);
    }
  };

  const sizePresets = [11, 12, 13, 14, 15, 16, 18];

  return (
    <div className="modal-backdrop settings-modal-backdrop" onClick={onClose}>
      <div
        className="modal settings-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 640, width: "95%" }}
      >
        <div className="settings-modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>⚙️</span>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Preferences & Studio Settings</h2>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                Customize themes, color palettes, typography, and workspace layout.
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        {/* Settings Navigation Tabs */}
        <div className="settings-nav-tabs">
          <button
            className={`settings-nav-tab ${activeTab === "theme" ? "active" : ""}`}
            onClick={() => setActiveTab("theme")}
          >
            🎨 Themes & Appearance
          </button>
          <button
            className={`settings-nav-tab ${activeTab === "typography" ? "active" : ""}`}
            onClick={() => setActiveTab("typography")}
          >
            🔤 Typography & Fonts
          </button>
          <button
            className={`settings-nav-tab ${activeTab === "layout" ? "active" : ""}`}
            onClick={() => setActiveTab("layout")}
          >
            ◫ Panel Layout & Workspace
          </button>
          <button
            className={`settings-nav-tab ${activeTab === "network" ? "active" : ""}`}
            onClick={() => setActiveTab("network")}
          >
            ⚡ Network & Timeout
          </button>
        </div>

        {activeTab === "theme" && (
          <div className="settings-tab-pane">
            <div className="settings-section">
              <div className="settings-label-row">
                <div>
                  <span className="settings-title">Studio Theme & Color Scheme</span>
                  <div className="settings-subtitle">
                    Select your preferred color theme (inspired by Bruno's theme architecture)
                  </div>
                </div>
              </div>

              <div className="theme-cards-grid">
                {THEME_PRESETS.map((t) => {
                  const isSelected = theme === t.id;
                  return (
                    <div
                      key={t.id}
                      className={`theme-card ${isSelected ? "selected" : ""}`}
                      onClick={() => onUpdateTheme?.(t.id)}
                    >
                      <div
                        className="theme-card-preview"
                        style={{
                          background: t.bg,
                          borderColor: isSelected ? t.accent : undefined,
                        }}
                      >
                        <div
                          className="theme-card-preview-sidebar"
                          style={{ background: t.sidebarBg }}
                        >
                          <div
                            className="theme-card-preview-item"
                            style={{ background: t.accent, width: "65%" }}
                          />
                          <div
                            className="theme-card-preview-item"
                            style={{ background: t.cardBg, width: "80%" }}
                          />
                          <div
                            className="theme-card-preview-item"
                            style={{ background: t.cardBg, width: "50%" }}
                          />
                        </div>
                        <div className="theme-card-preview-main">
                          <div
                            className="theme-card-preview-bar"
                            style={{ background: t.cardBg, borderColor: t.accent }}
                          >
                            <span style={{ color: t.accent, fontWeight: 700, fontSize: 8 }}>
                              GET
                            </span>
                            <span style={{ color: t.textMute, fontSize: 7.5 }}>
                              api/users
                            </span>
                          </div>
                          <div className="theme-card-preview-content">
                            <div
                              className="theme-preview-code-line"
                              style={{ background: t.textMute, width: "75%" }}
                            />
                            <div
                              className="theme-preview-code-line"
                              style={{ background: t.accent, width: "50%" }}
                            />
                            <div
                              className="theme-preview-code-line"
                              style={{ background: t.textMute, width: "60%" }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="theme-card-info">
                        <div className="theme-card-title-row">
                          <span className="theme-card-name" style={{ color: t.textColor }}>
                            {t.name}
                          </span>
                          <span className="theme-card-badge">{t.badge}</span>
                        </div>
                        <p className="theme-card-desc">{t.desc}</p>
                        {isSelected && (
                          <div className="theme-card-active-indicator">
                            <span className="theme-check-icon">✓</span>
                            <span>Active Theme</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              className="modal-actions"
              style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 10 }}
            >
              <div style={{ flex: 1 }} />
              <button className="btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}

        {activeTab === "typography" && (
          <div className="settings-tab-pane">
            <div className="settings-section">
              <div className="settings-label-row">
                <div>
                  <span className="settings-title">Application Font Size</span>
                  <div className="settings-subtitle">Controls UI buttons, navigation, tree items, and labels</div>
                </div>
                <span className="settings-badge">{localSettings.fontSize}px</span>
              </div>

              <div className="settings-size-controls">
                <button
                  className="btn sm"
                  onClick={() => changeFontSize(-1)}
                  disabled={localSettings.fontSize <= 11}
                  title="Decrease font size"
                >
                  A−
                </button>
                <div className="settings-pills">
                  {sizePresets.map((size) => (
                    <button
                      key={size}
                      className={`settings-pill-btn ${localSettings.fontSize === size ? "active" : ""}`}
                      onClick={() => update({ fontSize: size })}
                    >
                      {size}px
                    </button>
                  ))}
                </div>
                <button
                  className="btn sm"
                  onClick={() => changeFontSize(1)}
                  disabled={localSettings.fontSize >= 22}
                  title="Increase font size"
                >
                  A+
                </button>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-label-row">
                <div>
                  <span className="settings-title">Application Font Family</span>
                  <div className="settings-subtitle">Choose typography style for the entire interface</div>
                </div>
              </div>

              <select
                className="settings-select"
                value={localSettings.fontFamily}
                onChange={(e) => update({ fontFamily: e.target.value })}
              >
                {FONT_FAMILY_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.value}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-section">
              <div className="settings-label-row">
                <div>
                  <span className="settings-title">Code & Editor Font</span>
                  <div className="settings-subtitle">Monospace font for JSON payloads, headers, cURL, and responses</div>
                </div>
                <span className="settings-badge">{localSettings.codeFontSize}px</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
                <select
                  className="settings-select"
                  value={localSettings.codeFontFamily}
                  onChange={(e) => update({ codeFontFamily: e.target.value })}
                >
                  {CODE_FONT_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.value}>
                      {preset.name}
                    </option>
                  ))}
                </select>

                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    className="btn sm"
                    onClick={() => changeCodeFontSize(-1)}
                    disabled={localSettings.codeFontSize <= 10}
                    title="Decrease code size"
                  >
                    −
                  </button>
                  <button
                    className="btn sm"
                    onClick={() => changeCodeFontSize(1)}
                    disabled={localSettings.codeFontSize >= 24}
                    title="Increase code size"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Live Preview Box */}
            <div className="settings-preview-box">
              <div className="settings-preview-header">
                <span>LIVE PREVIEW</span>
                <span>{localSettings.fontSize}px / {localSettings.codeFontSize}px</span>
              </div>
              <div
                className="settings-preview-body"
                style={{
                  fontFamily: localSettings.fontFamily,
                  fontSize: `${localSettings.fontSize}px`,
                }}
              >
                <div>The quick brown fox jumps over the lazy dog.</div>
                <pre
                  className="settings-preview-code"
                  style={{
                    fontFamily: localSettings.codeFontFamily,
                    fontSize: `${localSettings.codeFontSize}px`,
                  }}
                >
{`{
  "status": "ready",
  "engine": "Pulse API Studio",
  "fontSize": ${localSettings.fontSize},
  "codeSize": ${localSettings.codeFontSize}
}`}
                </pre>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 10 }}>
              <button
                className={`btn sm ${resetNotif ? "primary" : "ghost"}`}
                onClick={resetDefaults}
                title="Reset to default values: 13px UI, Monaco, IBMPlexMono, 'Courier New', monospace for code"
              >
                {resetNotif ? "✓ Restored Defaults" : "Reset to Default"}
              </button>
              {resetNotif && (
                <span style={{ fontSize: 11, color: "var(--ok)", fontWeight: 600 }}>
                  Monaco, IBMPlexMono, Courier New active
                </span>
              )}
              <div style={{ flex: 1 }} />
              <button className="btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}

        {/* Panel Layout & Workspace Tab */}
        {activeTab === "layout" && (
          <div className="settings-tab-pane settings-layout-section">
            <div className="settings-section">
              <div className="settings-label-row">
                <div>
                  <span className="settings-title">Studio Panel Arrangement</span>
                  <div className="settings-subtitle">
                    Decide where to display the Response Pane and Code Snippet panel in the Studio workspace.
                  </div>
                </div>
              </div>

              <div className="layout-choice-grid">
                {/* Option 1: Response Bottom / Snippet Right */}
                <div
                  className={`layout-card ${panelLayout === "response-bottom" ? "selected" : ""}`}
                  onClick={() => onUpdatePanelLayout && onUpdatePanelLayout("response-bottom")}
                >
                  <div className="layout-card-header">
                    <div className="layout-card-radio">
                      <span className={`radio-dot ${panelLayout === "response-bottom" ? "checked" : ""}`} />
                    </div>
                    <div>
                      <div className="layout-card-name">Response on Bottom, Snippet on Right</div>
                      <div className="layout-card-badge">Standard Layout</div>
                    </div>
                  </div>

                  <div className="layout-mockup-diagram">
                    <div className="mockup-sidebar">Sidebar</div>
                    <div className="mockup-center-v">
                      <div className="mockup-request">Request Panel</div>
                      <div className="mockup-divider-h">⋯ drag to resize ⋯</div>
                      <div className="mockup-response active-mock">Response Pane (Bottom)</div>
                    </div>
                    <div className="mockup-right-col">
                      <div className="mockup-snippet active-mock">Code Snippet (Right)</div>
                    </div>
                  </div>

                  <p className="layout-card-desc">
                    Classic stacked layout: Request on top, Response panel below it. The Code Snippet appears in the right sidebar.
                  </p>
                </div>

                {/* Option 2: Response Right / Snippet Bottom */}
                <div
                  className={`layout-card ${panelLayout === "response-right" ? "selected" : ""}`}
                  onClick={() => onUpdatePanelLayout && onUpdatePanelLayout("response-right")}
                >
                  <div className="layout-card-header">
                    <div className="layout-card-radio">
                      <span className={`radio-dot ${panelLayout === "response-right" ? "checked" : ""}`} />
                    </div>
                    <div>
                      <div className="layout-card-name">Response on Right, Snippet on Bottom</div>
                      <div className="layout-card-badge">Side-by-Side 3-Column</div>
                    </div>
                  </div>

                  <div className="layout-mockup-diagram">
                    <div className="mockup-sidebar">Sidebar</div>
                    <div className="mockup-center-v">
                      <div className="mockup-request">Request Panel</div>
                      <div className="mockup-divider-h">⋯ drag to resize ⋯</div>
                      <div className="mockup-snippet active-mock">Code Snippet (Bottom Drawer)</div>
                    </div>
                    <div className="mockup-right-col">
                      <div className="mockup-response active-mock">Response Pane (Full Right)</div>
                    </div>
                  </div>

                  <p className="layout-card-desc">
                    Side-by-side layout: Request in center, Response in the right column with full vertical height. Code Snippet moves to the bottom drawer.
                  </p>
                </div>
              </div>
            </div>

            {/* Resizing Tips & Reset */}
            <div className="settings-section" style={{ background: "var(--bg-2)", padding: 14, borderRadius: 6, border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 18 }}>↔️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>Drag-to-Resize Dividers</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2, lineHeight: 1.5 }}>
                    You can smoothly resize both panels in real-time by hovering over and dragging the vertical or horizontal divider borders. Pulse remembers your custom panel dimensions across sessions.
                  </div>
                </div>
                <button
                  className="btn sm ghost"
                  onClick={handleResetPanels}
                  title="Reset panel width to 340px and bottom height to 280px"
                  style={{ flexShrink: 0 }}
                >
                  {panelResetNotif ? "✓ Reset!" : "Reset Panel Sizes"}
                </button>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }} />
              <button className="btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}

        {activeTab === "network" && (
          <div className="settings-tab-pane">
            <div className="settings-section">
              <div className="settings-label-row">
                <div>
                  <div className="settings-label">HTTP Request Timeout</div>
                  <div className="settings-sublabel">
                    Set maximum wait time before aborting an outbound HTTP request. Set to 0 for unlimited / no timeout (recommended for slow APIs, file processing, and LLM queries).
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={requestTimeout}
                    onChange={(e) => handleTimeoutChange(Number(e.target.value) || 0)}
                    style={{
                      width: 100,
                      padding: "4px 8px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      color: "var(--text)",
                      fontFamily: "var(--mono)",
                      fontSize: 12,
                      textAlign: "right",
                    }}
                  />
                  <span className="muted" style={{ fontSize: 12 }}>ms</span>
                </div>
              </div>

              {/* Quick Presets */}
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[
                  { label: "0 (Unlimited / No Timeout)", val: 0 },
                  { label: "30s (30,000 ms)", val: 30000 },
                  { label: "60s (60,000 ms)", val: 60000 },
                  { label: "120s (2 min)", val: 120000 },
                  { label: "300s (5 min)", val: 300000 },
                ].map((preset) => (
                  <button
                    key={preset.val}
                    className={`btn sm ${requestTimeout === preset.val ? "primary" : "ghost"}`}
                    onClick={() => handleTimeoutChange(preset.val)}
                    style={{ fontSize: 11.5 }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-section" style={{ background: "var(--bg-2)", padding: 14, borderRadius: 6, border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 18 }}>💡</span>
                <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
                  <div><b>Per-Environment Override:</b> You can set a <code>timeout</code> variable in any Environment (e.g. <code>timeout = 60000</code> or <code>timeout = 0</code>) to customize timeouts per environment.</div>
                  <div style={{ marginTop: 4 }}><b>Why timeout was 30000ms:</b> Previously, request proxy layers defaulted strictly to a 30-second abort timer. Pulse now respects <code>0</code> (unlimited) and custom timeout configurations across native desktop IPC, local proxy, and direct fetch.</div>
                </div>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }} />
              <button className="btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

