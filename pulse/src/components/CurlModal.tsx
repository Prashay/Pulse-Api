import { useState } from "react";
import { parseCurl } from "../curl";
import type { RequestSnapshot } from "../types";

interface Props {
  onImport: (snap: RequestSnapshot) => void;
  onClose: () => void;
}

export function CurlModal({ onImport, onClose }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    try {
      const snap = parseCurl(text);
      onImport(snap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse curl");
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Import cURL</h2>
        <p className="muted">Paste a curl command. Headers, method, body, and basic/bearer auth are mapped into a request.</p>
        <textarea
          className="body-editor curl-paste"
          spellCheck={false}
          placeholder={"curl --location '{{order_service_url}}/actuator/health'"}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
        />
        {error && <div className="status-err" style={{ marginTop: 8, fontSize: 12 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={!text.trim()}>
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
