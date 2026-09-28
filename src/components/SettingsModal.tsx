import { useEffect, useState, type FC } from "react";

export interface FontSettings {
  fontSize: number; // in px, e.g. 13
  fontFamily: string;
  codeFontSize: number;
  codeFontFamily: string;
}

export const FONT_FAMILY_PRESETS = [
  {
    id: "default",
    name: "Inter & Jakarta (Default)",
    value: '"Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    sample: "Modern, balanced UI sans-serif",
  },
  {
    id: "jetbrains",
    name: "JetBrains Mono (Coding)",
    value: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
    sample: "Engineered for high readability in code",
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
    id: "fira",
    name: "Fira Code (Developer)",
    value: '"Fira Code", "Source Code Pro", Consolas, monospace',
    sample: "Monospace font with code ligature flair",
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
  {
    id: "monaco",
    name: "Monaco & IBM Plex Mono (Terminal)",
    value: "Monaco, IBMPlexMono, 'Courier New', monospace",
    sample: "Classic high-precision developer monospace",
  },
];

export const CODE_FONT_PRESETS = [
  {
    id: "monaco-ibm",
    name: "Monaco, IBM Plex Mono & Courier New (Default)",
    value: "Monaco, IBMPlexMono, 'Courier New', monospace",
  },
  {
    id: "jetbrains-mono",
    name: "JetBrains Mono",
    value: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace',
  },
  {
    id: "fira-code",
    name: "Fira Code",
    value: '"Fira Code", "Source Code Pro", Consolas, monospace',
  },
  {
    id: "cascadia",
    name: "Cascadia Code",
    value: '"Cascadia Code", Consolas, "Courier New", monospace',
  },
  {
    id: "system-mono",
    name: "System Monospace",
    value: 'ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace',
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: FontSettings;
  onUpdateSettings: (settings: FontSettings) => void;
}

export const SettingsModal: FC<Props> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  const [localSettings, setLocalSettings] = useState<FontSettings>(settings);
  const [resetNotif, setResetNotif] = useState(false);

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
      fontSize: 13,
      fontFamily: FONT_FAMILY_PRESETS[0].value,
      codeFontSize: 12,
      codeFontFamily: "Monaco, IBMPlexMono, 'Courier New', monospace",
    };
    setLocalSettings(defaults);
    onUpdateSettings(defaults);
    setResetNotif(true);
    setTimeout(() => setResetNotif(false), 2200);
  };

  const sizePresets = [11, 12, 13, 14, 15, 16, 18];

  return (
    <div className="modal-backdrop settings-modal-backdrop" onClick={onClose}>
      <div
        className="modal settings-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 580, width: "95%" }}
      >
        <div className="settings-modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>⚙️</span>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Display & Typography Settings</h2>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                Customize font size, font family, and code editor scaling across Pulse API Studio.
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

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
    </div>
  );
};
