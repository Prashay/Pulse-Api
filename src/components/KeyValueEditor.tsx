import { useState, useId } from "react";
import type { KeyValue } from "../types";
import { kv, uid } from "../id";

export interface HeaderPreset {
  label: string;
  key: string;
  value: string;
  title?: string;
}

interface Props {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  allowBulkEdit?: boolean;
  title?: string;
  presets?: HeaderPreset[];
}

export const COMMON_HEADER_PRESETS: HeaderPreset[] = [
  { label: "api-key ({{$guid}})", key: "api-key", value: "{{$guid}}", title: "Add api-key header with dynamic random GUID (generates unique value on send)" },
  { label: "JSON", key: "Content-Type", value: "application/json", title: "Add Content-Type: application/json" },
  { label: "Bearer Auth", key: "Authorization", value: "Bearer {{apiKey}}", title: "Add Authorization: Bearer {{apiKey}}" },
  { label: "Accept JSON", key: "Accept", value: "application/json", title: "Add Accept: application/json" },
  { label: "X-Request-ID", key: "X-Request-ID", value: "{{$guid}}", title: "Add X-Request-ID with dynamic random GUID" },
];

function serializeRows(rows: KeyValue[]): string {
  return rows
    .filter((r) => r.key.trim() || r.value.trim())
    .map((r) => (r.enabled ? `${r.key}: ${r.value}` : `// ${r.key}: ${r.value}`))
    .join("\n");
}

function parseText(text: string, currentRows: KeyValue[]): KeyValue[] {
  const lines = text.split("\n");
  const result: KeyValue[] = [];
  const usedIds = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let enabled = true;
    let content = line;

    if (content.startsWith("//") || content.startsWith("#")) {
      enabled = false;
      content = content.replace(/^(\/\/|#)\s*/, "").trim();
    }

    let key = "";
    let value = "";
    const colonIdx = content.indexOf(":");
    if (colonIdx >= 0) {
      key = content.slice(0, colonIdx).trim();
      value = content.slice(colonIdx + 1).trim();
    } else {
      key = content;
      value = "";
    }

    const existing = currentRows.find(
      (r) => r.key.toLowerCase() === key.toLowerCase() && !usedIds.has(r.id)
    );
    const rowId = existing ? existing.id : uid("kv");
    usedIds.add(rowId);

    result.push({
      id: rowId,
      key,
      value,
      enabled,
    });
  }

  return result;
}

export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  allowBulkEdit = true,
  title,
  presets,
}: Props) {
  const [isBulk, setIsBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const datalistKeyId = useId();
  const datalistValId = useId();

  const isHeaders = keyPlaceholder.toLowerCase().includes("header") || title?.toLowerCase().includes("header");
  const activePresets = presets || (isHeaders ? COMMON_HEADER_PRESETS : undefined);

  const display = [...rows, kv("", "", true)];

  const update = (index: number, patch: Partial<KeyValue>) => {
    const isNew = index >= rows.length;
    if (isNew) {
      const created = { ...display[index], ...patch };
      if (!created.key && !created.value) return;
      onChange([...rows, created]);
      return;
    }
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));

  const toggleBulk = () => {
    if (!isBulk) {
      setBulkText(serializeRows(rows));
      setIsBulk(true);
    } else {
      const parsed = parseText(bulkText, rows);
      onChange(parsed);
      setIsBulk(false);
    }
  };

  const handleBulkChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setBulkText(val);
    onChange(parseText(val, rows));
  };

  const applyPreset = (preset: HeaderPreset) => {
    const existingIdx = rows.findIndex((r) => r.key.toLowerCase() === preset.key.toLowerCase());
    let next: KeyValue[];
    if (existingIdx >= 0) {
      next = rows.map((r, i) => (i === existingIdx ? { ...r, value: preset.value, enabled: true } : r));
    } else {
      next = [...rows, kv(preset.key, preset.value, true)];
    }
    onChange(next);
    if (isBulk) {
      setBulkText(serializeRows(next));
    }
  };

  const activeCount = rows.filter((r) => r.key.trim() || r.value.trim()).length;

  return (
    <div className="kv-editor-wrapper">
      {/* Top Toolbar */}
      <div className="kv-toolbar">
        <div className="kv-toolbar-left">
          <span className="kv-toolbar-count">
            {activeCount} {activeCount === 1 ? (title ? title.replace(/s$/i, "") : "Item") : (title || "Items")}
          </span>
          {activePresets && activePresets.length > 0 && (
            <div className="kv-presets-bar">
              <span className="kv-presets-label">Quick Add:</span>
              {activePresets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="kv-preset-chip"
                  title={p.title || `Set ${p.key}: ${p.value}`}
                  onClick={() => applyPreset(p)}
                >
                  + {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="kv-toolbar-right">
          {allowBulkEdit && (
            <button
              type="button"
              className={`kv-mode-toggle-btn ${isBulk ? "active" : ""}`}
              onClick={toggleBulk}
              title={isBulk ? "Switch to Key-Value Table editor" : "Switch to Bulk Text editor (Postman style)"}
              aria-label={isBulk ? "Key-Value Edit" : "Bulk Edit"}
            >
              <span className="kv-toggle-icon">{isBulk ? "⊞" : "≡"}</span>
              <span className="kv-toggle-text">{isBulk ? "Key-Value Edit" : "Bulk Edit"}</span>
            </button>
          )}
        </div>
      </div>

      {isBulk ? (
        /* Bulk Edit Mode */
        <div className="kv-bulk-container">
          <div className="kv-bulk-hint">
            <span className="kv-hint-icon">💡</span>
            <span className="kv-hint-text">
              Enter one <code>Key: Value</code> per line. Prefix line with <code>//</code> to disable.
              Use <code>{"{{$guid}}"}</code> to generate a random GUID on send.
            </span>
            <button
              type="button"
              className="kv-bulk-action-btn"
              onClick={() => {
                const addLine = "api-key: {{$guid}}";
                const updated = bulkText ? `${bulkText.trimEnd()}\n${addLine}` : addLine;
                setBulkText(updated);
                onChange(parseText(updated, rows));
              }}
              title="Append api-key: {{$guid}} to bulk list"
            >
              + api-key: {"{{$guid}}"}
            </button>
            {bulkText && (
              <button
                type="button"
                className="kv-bulk-action-btn danger"
                onClick={() => {
                  setBulkText("");
                  onChange([]);
                }}
                title="Clear all rows"
              >
                Clear
              </button>
            )}
          </div>
          <textarea
            className="kv-bulk-textarea"
            value={bulkText}
            onChange={handleBulkChange}
            placeholder={`// Example ${title || "Header"} Bulk Format:\nContent-Type: application/json\napi-key: {{$guid}}\n// Cache-Control: no-cache`}
            spellCheck={false}
            rows={Math.max(6, (bulkText.match(/\n/g)?.length || 0) + 3)}
          />
        </div>
      ) : (
        /* Key-Value Table Mode */
        <div className="kv-table-container">
          <table className="kv-table">
            <thead>
              <tr>
                <th className="kv-col-check"></th>
                <th className="kv-col-key">{keyPlaceholder}</th>
                <th className="kv-col-val">{valuePlaceholder}</th>
                <th className="kv-col-action"></th>
              </tr>
            </thead>
            <tbody>
              {display.map((row, index) => {
                const isNew = index >= rows.length;
                return (
                  <tr key={row.id} className={isNew ? "kv-row-new" : "kv-row-item"}>
                    <td className="kv-cell-check">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        disabled={isNew}
                        onChange={(e) => update(index, { enabled: e.target.checked })}
                        aria-label={isNew ? "New row checkbox" : `Enable ${row.key || "row"}`}
                      />
                    </td>
                    <td className="kv-cell-key">
                      <input
                        type="text"
                        placeholder={keyPlaceholder}
                        value={row.key}
                        list={isHeaders ? datalistKeyId : undefined}
                        onChange={(e) => update(index, { key: e.target.value })}
                        aria-label="Key"
                      />
                    </td>
                    <td className="kv-cell-val">
                      <input
                        type="text"
                        placeholder={valuePlaceholder}
                        value={row.value}
                        list={isHeaders ? datalistValId : undefined}
                        onChange={(e) => update(index, { value: e.target.value })}
                        aria-label="Value"
                      />
                    </td>
                    <td className="kv-cell-action">
                      {!isNew && (
                        <button
                          type="button"
                          className="kv-remove-btn"
                          onClick={() => remove(row.id)}
                          title="Remove entry"
                          aria-label="Remove entry"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {isHeaders && (
            <>
              <datalist id={datalistKeyId}>
                <option value="Content-Type" />
                <option value="Accept" />
                <option value="Authorization" />
                <option value="api-key" />
                <option value="X-Api-Key" />
                <option value="X-Request-ID" />
                <option value="User-Agent" />
                <option value="Cache-Control" />
                <option value="Origin" />
                <option value="Access-Control-Allow-Origin" />
              </datalist>
              <datalist id={datalistValId}>
                <option value="application/json" />
                <option value="application/x-www-form-urlencoded" />
                <option value="multipart/form-data" />
                <option value="text/plain" />
                <option value="Bearer {{apiKey}}" />
                <option value="{{$guid}}" />
                <option value="no-cache" />
                <option value="*/*" />
              </datalist>
            </>
          )}
        </div>
      )}
    </div>
  );
}
