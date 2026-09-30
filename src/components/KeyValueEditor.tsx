import type { KeyValue } from "../types";
import { kv } from "../id";

interface Props {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: Props) {
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

  return (
    <table className="kv-table">
      <thead>
        <tr>
          <th style={{ width: 30 }}></th>
          <th>Key</th>
          <th>Value</th>
          <th style={{ width: 34 }}></th>
        </tr>
      </thead>
      <tbody>
        {display.map((row, index) => {
          const isNew = index >= rows.length;
          return (
            <tr key={row.id}>
              <td style={{ textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={row.enabled}
                  disabled={isNew}
                  onChange={(e) => update(index, { enabled: e.target.checked })}
                  aria-label={isNew ? "New row checkbox" : `Enable ${row.key || "row"}`}
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder={keyPlaceholder}
                  value={row.key}
                  onChange={(e) => update(index, { key: e.target.value })}
                  aria-label="Key"
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder={valuePlaceholder}
                  value={row.value}
                  onChange={(e) => update(index, { value: e.target.value })}
                  aria-label="Value"
                />
              </td>
              <td>
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
  );
}
