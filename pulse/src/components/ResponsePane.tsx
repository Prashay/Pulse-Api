import { useMemo, useState } from "react";
import type { ProxyResponse } from "../types";
import { formatBytes, prettyBody } from "../request";

type RespTab = "body" | "headers";

interface Props {
  response: ProxyResponse | null;
  sending: boolean;
}

export function ResponsePane({ response, sending }: Props) {
  const [tab, setTab] = useState<RespTab>("body");
  const [pretty, setPretty] = useState(true);

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
        {response && (
          <div className="resp-status">
            <span className={`status-pill ${statusClass}`}>
              {response.error ? response.statusText : `${response.status} ${response.statusText}`}
            </span>
            <span>{response.time} ms</span>
            <span>{formatBytes(response.size)}</span>
            {tab === "body" && (
              <button className="btn sm ghost" onClick={() => setPretty((p) => !p)}>
                {pretty ? "Raw" : "Pretty"}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="pane-body">
        {sending && <div className="empty busy">Sending request...</div>}
        {!sending && !response && (
          <div className="empty-hero">
            <div>Send a request to get a response</div>
            <div className="muted">Enter to send · Ctrl/Cmd+S to save</div>
          </div>
        )}
        {!sending && response && tab === "body" && <pre className="resp-pre">{body || "(empty)"}</pre>}
        {!sending && response && tab === "headers" && (
          <div className="headers-list">
            {Object.keys(response.headers).length === 0 && <div className="empty">No headers</div>}
            {Object.entries(response.headers).map(([k, v]) => (
              <div key={k}>
                <b>{k}</b>
                <span>{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
