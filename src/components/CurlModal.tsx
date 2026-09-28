import { useEffect, useMemo, useState } from "react";
import { parseCurl } from "../curl";
import { collectFolders } from "../tree";
import type { Collection, RequestSnapshot } from "../types";
import { METHOD_COLORS } from "../types";

export interface CurlImportTarget {
  mode: "existing" | "new" | "scratch";
  collectionId?: string;
  folderId?: string | null;
  newCollectionName?: string;
}

interface Props {
  collections: Collection[];
  onImport: (snap: RequestSnapshot, target: CurlImportTarget) => void;
  onClose: () => void;
}

const SAMPLE_CURL = `curl --location 'https://api.example.com/v1/orders' \\
--header 'Content-Type: application/json' \\
--header 'Authorization: Bearer secret_token_xyz' \\
--data '{
    "orderId": "ORD-94812",
    "customer": "Alex Johnson",
    "items": [
        { "sku": "PULSE-PRO", "quantity": 1, "price": 49.99 }
    ]
}'`;

export function CurlModal({ collections, onImport, onClose }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reqName, setReqName] = useState("");

  const [targetMode, setTargetMode] = useState<"existing" | "new" | "scratch">(() => {
    return collections.length > 0 ? "existing" : "new";
  });

  const [selectedColId, setSelectedColId] = useState<string>(() => {
    return collections[0]?.id ?? "";
  });

  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [newColName, setNewColName] = useState<string>("cURL Collection");

  // Keyboard navigation: Escape closes modal
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Dynamically parse cURL as the user types/pastes
  const parsedSnap = useMemo(() => {
    const raw = text.trim();
    if (!raw) {
      setError(null);
      return null;
    }
    try {
      const snap = parseCurl(raw);
      setError(null);
      return snap;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse curl command");
      return null;
    }
  }, [text]);

  // Update request name when parsedSnap changes
  useEffect(() => {
    if (parsedSnap) {
      setReqName(parsedSnap.name);
      try {
        const u = new URL(parsedSnap.url);
        const host = u.hostname.replace(/^www\./i, "");
        if (host && newColName === "cURL Collection") {
          const capitalized = host.split(".")[0];
          setNewColName(`${capitalized.charAt(0).toUpperCase() + capitalized.slice(1)} API`);
        }
      } catch {
        // url may contain templates like {{baseUrl}}, ignore
      }
    }
  }, [parsedSnap]);

  // Folders for selected existing collection
  const availableFolders = useMemo(() => {
    if (!selectedColId) return [];
    const col = collections.find((c) => c.id === selectedColId);
    if (!col) return [];
    return collectFolders(col.children);
  }, [collections, selectedColId]);

  const handlePasteClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText && clipText.trim()) {
        setText(clipText.trim());
      }
    } catch {
      setError("Clipboard access denied or unavailable.");
    }
  };

  const handleLoadSample = () => {
    setText(SAMPLE_CURL);
  };

  const submit = () => {
    if (!parsedSnap) return;

    const finalSnap: RequestSnapshot = {
      ...parsedSnap,
      name: reqName.trim() || parsedSnap.name,
    };

    const target: CurlImportTarget = {
      mode: targetMode,
      collectionId: targetMode === "existing" ? selectedColId || collections[0]?.id : undefined,
      folderId: targetMode === "existing" && selectedFolderId ? selectedFolderId : null,
      newCollectionName: targetMode === "new" ? newColName.trim() || "cURL Collection" : undefined,
    };

    onImport(finalSnap, target);
  };

  const activeCol = collections.find((c) => c.id === selectedColId);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal curl-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 680, width: "95%" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>📋</span>
              <h2 style={{ margin: 0, fontSize: 17 }}>Import cURL Command</h2>
            </div>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Convert raw cURL into an active API request and save it under a collection.
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* cURL input area & quick action buttons */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>cURL Command</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="btn sm ghost"
              onClick={handlePasteClipboard}
              title="Paste cURL from clipboard"
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              📋 Paste
            </button>
            <button
              type="button"
              className="btn sm ghost"
              onClick={handleLoadSample}
              title="Load example POST cURL"
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              Load Example
            </button>
            {text && (
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => setText("")}
                style={{ fontSize: 11, padding: "2px 8px" }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <textarea
          className="body-editor curl-paste"
          spellCheck={false}
          placeholder={"curl --location 'https://api.example.com/health' \\\n--header 'Authorization: Bearer token'"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ minHeight: 140, height: 160, fontFamily: "var(--mono)", fontSize: 12 }}
          autoFocus
        />

        {error && (
          <div
            style={{
              marginTop: 8,
              padding: "6px 10px",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 6,
              color: "#fca5a5",
              fontSize: 12,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Live Detected Endpoint Preview */}
        {parsedSnap && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <span
                className={`method ${METHOD_COLORS[parsedSnap.method] || "badge-http"}`}
                style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 4 }}
              >
                {parsedSnap.method}
              </span>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  color: "var(--text)",
                  wordBreak: "break-all",
                  flex: 1,
                  minWidth: 160,
                }}
              >
                {parsedSnap.url || "/"}
              </span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {parsedSnap.headers.length > 0 && (
                  <span className="footer-encoding" title="Headers count">
                    {parsedSnap.headers.length} headers
                  </span>
                )}
                {parsedSnap.params.length > 0 && (
                  <span className="footer-encoding" title="Query params count">
                    {parsedSnap.params.length} params
                  </span>
                )}
                {parsedSnap.bodyMode !== "none" && (
                  <span className="footer-badge-version" title="Body mode">
                    {parsedSnap.bodyMode.toUpperCase()}
                  </span>
                )}
                {parsedSnap.auth.type !== "none" && (
                  <span
                    className="footer-badge-version"
                    style={{ background: "rgba(16, 185, 129, 0.15)", color: "var(--ok)", borderColor: "rgba(16, 185, 129, 0.3)" }}
                  >
                    Auth: {parsedSnap.auth.type}
                  </span>
                )}
              </div>
            </div>

            {/* Editable Request Name */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap", fontWeight: 600 }}>
                Request Name:
              </label>
              <input
                type="text"
                value={reqName}
                onChange={(e) => setReqName(e.target.value)}
                placeholder="e.g. Get User Profile"
                style={{
                  flex: 1,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "5px 8px",
                  fontSize: 12,
                  color: "var(--text)",
                  outline: "none",
                }}
              />
            </div>
          </div>
        )}

        {/* Save Destination Selection */}
        <div className="curl-dest-container">
          <div className="curl-dest-header">
            <span className="curl-dest-label">Save Destination</span>
            <span className="curl-dest-hint">
              {targetMode === "existing"
                ? "Pre-existing collection"
                : targetMode === "new"
                ? "Brand new collection"
                : "Temporary draft tab"}
            </span>
          </div>

          <div className="curl-dest-segmented">
            <button
              type="button"
              className={`curl-dest-tab ${targetMode === "existing" ? "active" : ""}`}
              onClick={() => setTargetMode("existing")}
              disabled={collections.length === 0}
              title="Save directly into an existing collection"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span>Existing Collection</span>
            </button>

            <button
              type="button"
              className={`curl-dest-tab ${targetMode === "new" ? "active" : ""}`}
              onClick={() => setTargetMode("new")}
              title="Create a new collection for this request"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <line x1="12" y1="11" x2="12" y2="17" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
              <span>New Collection</span>
            </button>

            <button
              type="button"
              className={`curl-dest-tab ${targetMode === "scratch" ? "active" : ""}`}
              onClick={() => setTargetMode("scratch")}
              title="Open in a draft tab without saving immediately"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              <span>Scratchpad Tab</span>
            </button>
          </div>

          {/* Compact conditional configuration */}
          {targetMode === "existing" && (
            <div className="curl-dest-config">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: availableFolders.length > 0 ? "1.2fr 1fr" : "1fr",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <div>
                  <select
                    className="curl-dest-select"
                    value={selectedColId}
                    onChange={(e) => {
                      setSelectedColId(e.target.value);
                      setSelectedFolderId("");
                    }}
                  >
                    {collections.map((col) => (
                      <option key={col.id} value={col.id}>
                        📁 {col.name} ({col.children.length} items)
                      </option>
                    ))}
                  </select>
                </div>

                {availableFolders.length > 0 && (
                  <div>
                    <select
                      className="curl-dest-select"
                      value={selectedFolderId}
                      onChange={(e) => setSelectedFolderId(e.target.value)}
                    >
                      <option value="">📁 Root (Main collection)</option>
                      {availableFolders.map((fld) => (
                        <option key={fld.id} value={fld.id}>
                          📂 {fld.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {targetMode === "new" && (
            <div className="curl-dest-config">
              <input
                type="text"
                className="curl-dest-input"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="Enter new collection name (e.g. Payments API)"
              />
            </div>
          )}

          {targetMode === "scratch" && (
            <div className="curl-dest-config">
              <div className="curl-dest-scratch-note">
                <span>💡</span>
                <span>Opens as a draft tab. You can inspect, modify, run, and click <strong>Save</strong> anytime later.</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal actions */}
        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={submit}
            disabled={!text.trim() || !parsedSnap}
          >
            {targetMode === "existing"
              ? `Save to "${activeCol?.name || "Collection"}"`
              : targetMode === "new"
              ? `Create Collection & Save`
              : `Open in Scratchpad`}
          </button>
        </div>
      </div>
    </div>
  );
}
