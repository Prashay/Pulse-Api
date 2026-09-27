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
          <th style={{ width: 28 }}></th>
          <th>Key</th>
          <th>Value</th>
          <th style={{ width: 32 }}></th>
        </tr>
      </thead>
      <tbody>
        {display.map((row, index) => {
          const isNew = index >= rows.length;
          return (
            <tr key={row.id}>
              <td>
                <input
                  type="checkbox"
                  checked={row.enabled}
                  disabled={isNew}
                  onChange={(e) => update(index, { enabled: e.target.checked })}
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder={keyPlaceholder}
                  value={row.key}
                  onChange={(e) => update(index, { key: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder={valuePlaceholder}
                  value={row.value}
                  onChange={(e) => update(index, { value: e.target.value })}
                />
              </td>
              <td>
                {!isNew && (
                  <button className="icon-btn" onClick={() => remove(row.id)} title="Remove">
                    x
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
