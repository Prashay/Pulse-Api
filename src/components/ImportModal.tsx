import { useRef, useState } from "react";
import type { Collection, Environment } from "../types";
import { parseImportFiles, importPostmanFile, parseDocToCollection } from "../importExport";

interface Props {
  onImportSuccess: (result: {
    collections: Collection[];
    environments: Environment[];
    message: string;
  }) => void;
  onClose: () => void;
}

export function ImportModal({ onImportSuccess, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"files" | "folder" | "raw">("files");
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [rawText, setRawText] = useState("");
  const [rawName, setRawName] = useState("");
  const [preview, setPreview] = useState<{
    collections: Collection[];
    environments: Environment[];
    errors: string[];
    sourceLabel: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[], sourceLabel: string) => {
    setLoading(true);
    try {
      const res = await parseImportFiles(files);
      setPreview({
        collections: res.collections,
        environments: res.environments,
        errors: res.errors,
        sourceLabel,
      });
    } catch (err) {
      setPreview({
        collections: [],
        environments: [],
        errors: [err instanceof Error ? err.message : "Error reading files"],
        sourceLabel,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRawImport = () => {
    if (!rawText.trim()) return;
    const trimmed = rawText.trim();
    try {
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const parsed = JSON.parse(trimmed);
        const res = importPostmanFile(parsed, rawName.trim() || undefined);
        const cols: Collection[] = res.collection ? [res.collection] : [];
        const envs: Environment[] = res.environment ? [res.environment] : [];
        setPreview({
          collections: cols,
          environments: envs,
          errors: [],
          sourceLabel: "Pasted JSON Content",
        });
        return;
      }
    } catch {
      // Fallback to markdown/documentation parser below
    }

    // Parse as Markdown / API Documentation
    const col = parseDocToCollection(trimmed, rawName.trim() || "Pasted Documentation API");
    if (col.children.length > 0) {
      setPreview({
        collections: [col],
        environments: [],
        errors: [],
        sourceLabel: `Pasted Markdown / Doc (${col.children.length} endpoints detected)`,
      });
    } else {
      setPreview({
        collections: [],
        environments: [],
        errors: ["No valid API endpoints, cURL commands, or URLs found in pasted text."],
        sourceLabel: "Pasted Content",
      });
    }
  };

  const confirmImport = () => {
    if (!preview) return;
    const { collections, environments } = preview;
    if (collections.length === 0 && environments.length === 0) return;

    const parts: string[] = [];
    if (collections.length > 0) {
      parts.push(`${collections.length} collection${collections.length === 1 ? "" : "s"}`);
    }
    if (environments.length > 0) {
      parts.push(`${environments.length} environment${environments.length === 1 ? "" : "s"}`);
    }

    onImportSuccess({
      collections,
      environments,
      message: `Successfully imported ${parts.join(" and ")}`,
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={{ width: "min(680px, 94vw)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Import API Collections & Environments</h2>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 16 }}>
            ✕
          </button>
        </div>
        <div className="muted" style={{ marginTop: 4, marginBottom: 14 }}>
          Import Postman collections (v2.1), environments, globals, or API documentation (README.md, doc, docx, txt).
        </div>

        {/* Tab selection */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
          <button
            className={`btn sm ${activeTab === "files" ? "primary" : "ghost"}`}
            onClick={() => {
              setActiveTab("files");
              setPreview(null);
            }}
          >
            📄 Choose File(s)
          </button>
          <button
            className={`btn sm ${activeTab === "folder" ? "primary" : "ghost"}`}
            onClick={() => {
              setActiveTab("folder");
              setPreview(null);
            }}
          >
            📁 Choose Folder
          </button>
          <button
            className={`btn sm ${activeTab === "raw" ? "primary" : "ghost"}`}
            onClick={() => {
              setActiveTab("raw");
              setPreview(null);
            }}
          >
            📋 Paste Raw (JSON / Markdown / Doc)
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "files" && (
          <div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.length) {
                  void handleFiles(e.dataTransfer.files, `${e.dataTransfer.files.length} dropped file(s)`);
                }
              }}
              style={{
                border: `2px dashed ${isDragging ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 8,
                padding: "36px 20px",
                textAlign: "center",
                background: isDragging ? "var(--accent-soft)" : "var(--bg)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                Click to browse or drop your files here
              </div>
              <div className="muted">
                Supports Postman collections & environments (.json), README (.md), and API Docs (.doc, .docx, .txt)
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="application/json,.json,.md,.markdown,.doc,.docx,.txt,text/markdown,text/plain"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files?.length) {
                    void handleFiles(e.target.files, `${e.target.files.length} selected file(s)`);
                  }
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        )}

        {activeTab === "folder" && (
          <div>
            <div
              style={{
                border: "2px dashed var(--border)",
                borderRadius: 8,
                padding: "36px 20px",
                textAlign: "center",
                background: "var(--bg)",
                cursor: "pointer",
              }}
              onClick={() => folderInputRef.current?.click()}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                Select an entire folder of collections & environments
              </div>
              <div className="muted">
                Pulse API Studio will automatically scan the folder and all subfolders for all collection and environment JSON files
              </div>
              <input
                ref={folderInputRef}
                type="file"
                // @ts-expect-error webkitdirectory is standard in modern browsers
                webkitdirectory=""
                directory=""
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files?.length) {
                    const samplePath = (e.target.files[0] as unknown as { webkitRelativePath?: string })?.webkitRelativePath;
                    const folderName = samplePath ? samplePath.split("/")[0] : "Folder";
                    void handleFiles(e.target.files, `Folder: "${folderName}" (${e.target.files.length} files scanned)`);
                  }
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        )}

        {activeTab === "raw" && (
          <div>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Name (optional for environment/collection)</label>
              <input
                placeholder="e.g. Local Environment or My Test Suite"
                value={rawName}
                onChange={(e) => setRawName(e.target.value)}
              />
            </div>
            <div className="field">
              <label>JSON or Markdown / Documentation Content</label>
              <textarea
                placeholder="Paste raw Postman JSON, README.md, API markdown tables, or cURL commands here..."
                style={{ minHeight: 160, fontFamily: "var(--mono)", fontSize: 11 }}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />
            </div>
            <button
              className="btn primary sm"
              onClick={handleRawImport}
              disabled={!rawText.trim()}
              style={{ marginTop: 4 }}
            >
              Parse Content
            </button>
          </div>
        )}

        {/* Loading Indicator */}
        {loading && (
          <div style={{ textAlign: "center", padding: 16, color: "var(--info)" }}>
            Scanning and parsing files...
          </div>
        )}

        {/* Preview Section */}
        {preview && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 6,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Scan Summary ({preview.sourceLabel})</span>
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                {preview.collections.length} collection(s), {preview.environments.length} environment(s)
              </span>
            </div>

            {preview.collections.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "var(--text-mute)", fontWeight: 600, marginBottom: 4 }}>
                  COLLECTIONS DETECTED:
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {preview.collections.map((col) => (
                    <span
                      key={col.id}
                      style={{
                        background: "var(--bg-3)",
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        border: "1px solid var(--border-soft)",
                      }}
                    >
                      <b style={{ color: "var(--ok)" }}>✓</b> {col.name} ({col.children.length} items)
                    </span>
                  ))}
                </div>
              </div>
            )}

            {preview.environments.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "var(--text-mute)", fontWeight: 600, marginBottom: 4 }}>
                  ENVIRONMENTS DETECTED:
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {preview.environments.map((env) => (
                    <span
                      key={env.id}
                      style={{
                        background: "var(--bg-3)",
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        border: "1px solid var(--border-soft)",
                      }}
                    >
                      <b style={{ color: "var(--info)" }}>E</b> {env.name} ({env.variables.length} vars)
                    </span>
                  ))}
                </div>
              </div>
            )}

            {preview.errors.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: "var(--err)", fontWeight: 600, marginBottom: 2 }}>
                  Notice / Non-Postman items skipped ({preview.errors.length}):
                </div>
                <div style={{ fontSize: 10, color: "var(--text-dim)", maxHeight: 60, overflowY: "auto" }}>
                  {preview.errors.slice(0, 3).map((err, idx) => (
                    <div key={idx}>• {err}</div>
                  ))}
                  {preview.errors.length > 3 && <div>...and {preview.errors.length - 3} more files skipped</div>}
                </div>
              </div>
            )}

            {preview.collections.length === 0 && preview.environments.length === 0 && (
              <div style={{ color: "var(--err)", fontSize: 12, padding: 8, textAlign: "center" }}>
                No valid Postman collections or environment JSON files could be found.
              </div>
            )}
          </div>
        )}

        {/* Modal Actions */}
        <div className="modal-actions" style={{ marginTop: 16 }}>
          {preview && (preview.collections.length > 0 || preview.environments.length > 0) && (
            <button className="btn primary" onClick={confirmImport} style={{ fontWeight: 700 }}>
              Import {preview.collections.length} Collection{preview.collections.length === 1 ? "" : "s"} &{" "}
              {preview.environments.length} Environment{preview.environments.length === 1 ? "" : "s"}
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
