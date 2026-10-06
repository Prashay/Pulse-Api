import { useEffect, useMemo, useRef, useState } from "react";
import type { Collection, Environment } from "../types";
import { parseImportFiles, importPostmanFile, parseDocToCollection } from "../importExport";
import { collectFolders } from "../tree";

export interface ImportResult {
  collections: Collection[];
  environments: Environment[];
  targetMode: "new" | "existing";
  targetColId?: string;
  targetFolderMode?: "as-subfolder" | "root" | "existing-folder";
  targetFolderId?: string | null;
  activeEnvId?: string | null;
  message: string;
}

interface Props {
  existingCollections?: Collection[];
  initialFiles?: File[] | null;
  onImportSuccess: (result: ImportResult) => void;
  onClose: () => void;
}

export function ImportModal({ existingCollections = [], initialFiles, onImportSuccess, onClose }: Props) {
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

  // Destination placement options (matches cURL Import capability)
  const [targetMode, setTargetMode] = useState<"new" | "existing">("new");
  const [selectedColId, setSelectedColId] = useState<string>(() => {
    return existingCollections[0]?.id ?? "";
  });
  const [folderPlacementMode, setFolderPlacementMode] = useState<"as-subfolder" | "root" | "existing-folder">("as-subfolder");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [activeEnvOnImport, setActiveEnvOnImport] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Escape key closes modal
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

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
      // If collections were parsed and existing collections are available, keep options ready
      if (existingCollections.length > 0 && !selectedColId) {
        setSelectedColId(existingCollections[0].id);
      }
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

  // If initialFiles was supplied via quick file upload, parse it immediately
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      void handleFiles(initialFiles, `${initialFiles.length} uploaded file(s)`);
    }
  }, [initialFiles]);

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

  const handleRenameCollection = (id: string, newName: string) => {
    setPreview((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        collections: prev.collections.map((c) => (c.id === id ? { ...c, name: newName } : c)),
      };
    });
  };

  const handleRenameEnvironment = (id: string, newName: string) => {
    setPreview((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        environments: prev.environments.map((e) => (e.id === id ? { ...e, name: newName } : e)),
      };
    });
  };

  const availableFolders = useMemo(() => {
    if (!selectedColId || !existingCollections) return [];
    const col = existingCollections.find((c) => c.id === selectedColId);
    if (!col) return [];
    return collectFolders(col.children);
  }, [existingCollections, selectedColId]);

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

    let successMsg = `Successfully imported ${parts.join(" and ")}`;
    if (targetMode === "existing") {
      const targetCol = existingCollections.find((c) => c.id === selectedColId);
      if (targetCol) {
        successMsg = `Imported ${collections.length} collection item(s) into "${targetCol.name}"`;
      }
    }

    onImportSuccess({
      collections,
      environments,
      targetMode,
      targetColId: targetMode === "existing" ? selectedColId || existingCollections[0]?.id : undefined,
      targetFolderMode: folderPlacementMode,
      targetFolderId: folderPlacementMode === "existing-folder" && selectedFolderId ? selectedFolderId : null,
      activeEnvId: activeEnvOnImport && environments.length > 0 ? environments[0].id : null,
      message: successMsg,
    });
    onClose();
  };

  const activeTargetCol = existingCollections.find((c) => c.id === selectedColId);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={{ width: "min(680px, 94vw)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>📥</span>
            <h2 style={{ margin: 0, fontSize: 17 }}>Import Collections & Environments</h2>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 16 }}>
            ✕
          </button>
        </div>
        <div className="muted" style={{ marginTop: 4, marginBottom: 14 }}>
          Import Postman collections (v2.1), environments, globals, OpenAPI, or API documentation (Markdown, Word .docx, .txt).
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
            📋 Paste Raw (JSON / Doc)
          </button>
        </div>

        {/* Tab content scrollable */}
        <div style={{ overflowY: "auto", flex: 1, paddingRight: 4 }}>
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
                  padding: "30px 20px",
                  textAlign: "center",
                  background: isDragging ? "var(--accent-soft)" : "var(--bg)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                  Click to browse or drop your file(s) here
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  Supports Postman (.json), Markdown (.md), Word (.docx), and plain text API specs
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
                  padding: "30px 20px",
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
                <div className="muted" style={{ fontSize: 11 }}>
                  Pulse API Studio will automatically scan the folder and all subfolders for API JSON & documentation files
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
                  style={{ minHeight: 140, fontFamily: "var(--mono)", fontSize: 11 }}
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
                borderRadius: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Scan Summary ({preview.sourceLabel})</span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  {preview.collections.length} collection(s), {preview.environments.length} environment(s)
                </span>
              </div>

              {/* Detected Collections with Live Rename Inputs */}
              {preview.collections.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: "var(--text-mute)", fontWeight: 700, marginBottom: 6, letterSpacing: "0.03em" }}>
                    COLLECTIONS DETECTED (RENAME BEFORE IMPORT):
                  </div>
                  <div className="import-items-list">
                    {preview.collections.map((col) => (
                      <div key={col.id} className="import-item-card">
                        <div className="import-item-header">
                          <span className="import-item-badge">
                            <span>📁</span> Collection
                          </span>
                          <span className="import-item-count">{col.children.length} item(s)</span>
                        </div>
                        <input
                          type="text"
                          className="import-item-name-input"
                          value={col.name}
                          onChange={(e) => handleRenameCollection(col.id, e.target.value)}
                          placeholder="Collection Name"
                          title="Rename this collection"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Where to place & Destination Options (Same functionality as cURL import) */}
              {preview.collections.length > 0 && (
                <div className="curl-dest-container" style={{ marginTop: 12 }}>
                  <div className="curl-dest-header">
                    <span className="curl-dest-label">Save Destination</span>
                    <span className="curl-dest-hint">
                      {targetMode === "new"
                        ? "Create as new collection(s)"
                        : "Merge into an existing collection"}
                    </span>
                  </div>

                  <div className="curl-dest-segmented">
                    <button
                      type="button"
                      className={`curl-dest-tab ${targetMode === "new" ? "active" : ""}`}
                      onClick={() => setTargetMode("new")}
                      title="Create brand new collection(s) in workspace"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        <line x1="12" y1="11" x2="12" y2="17" />
                        <line x1="9" y1="14" x2="15" y2="14" />
                      </svg>
                      <span>New Collection(s)</span>
                    </button>

                    <button
                      type="button"
                      className={`curl-dest-tab ${targetMode === "existing" ? "active" : ""}`}
                      onClick={() => setTargetMode("existing")}
                      disabled={existingCollections.length === 0}
                      title={existingCollections.length === 0 ? "No existing collections available" : "Merge into existing collection"}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      <span>Existing Collection</span>
                    </button>
                  </div>

                  {targetMode === "existing" && (
                    <div className="curl-dest-config">
                      <div style={{ display: "grid", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", marginBottom: 4, display: "block" }}>
                            Target Collection:
                          </label>
                          <select
                            className="curl-dest-select"
                            value={selectedColId}
                            onChange={(e) => {
                              setSelectedColId(e.target.value);
                              setSelectedFolderId("");
                            }}
                          >
                            {existingCollections.map((c) => (
                              <option key={c.id} value={c.id}>
                                📁 {c.name} ({c.children.length} items)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", marginBottom: 4, display: "block" }}>
                            Placement Location:
                          </label>
                          <select
                            className="curl-dest-select"
                            value={folderPlacementMode}
                            onChange={(e) => setFolderPlacementMode(e.target.value as any)}
                          >
                            <option value="as-subfolder">📂 Create as new subfolder(s) inside this collection</option>
                            <option value="root">📁 Merge directly into root of collection</option>
                            {availableFolders.length > 0 && (
                              <option value="existing-folder">📥 Place inside existing folder...</option>
                            )}
                          </select>
                        </div>

                        {folderPlacementMode === "existing-folder" && availableFolders.length > 0 && (
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", marginBottom: 4, display: "block" }}>
                              Choose Folder:
                            </label>
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
                </div>
              )}

              {/* Detected Environments with Live Rename Inputs */}
              {preview.environments.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: "var(--text-mute)", fontWeight: 700, marginBottom: 6, letterSpacing: "0.03em" }}>
                    ENVIRONMENTS DETECTED (RENAME BEFORE IMPORT):
                  </div>
                  <div className="import-items-list">
                    {preview.environments.map((env) => (
                      <div key={env.id} className="import-item-card">
                        <div className="import-item-header">
                          <span className="import-item-badge badge-env">
                            <span>🌐</span> Environment
                          </span>
                          <span className="import-item-count">{env.variables.length} variable(s)</span>
                        </div>
                        <input
                          type="text"
                          className="import-item-name-input"
                          value={env.name}
                          onChange={(e) => handleRenameEnvironment(env.id, e.target.value)}
                          placeholder="Environment Name"
                          title="Rename this environment"
                        />
                      </div>
                    ))}
                  </div>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11.5,
                      marginTop: 8,
                      cursor: "pointer",
                      color: "var(--text-dim)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={activeEnvOnImport}
                      onChange={(e) => setActiveEnvOnImport(e.target.checked)}
                    />
                    <span>Set first environment as active environment</span>
                  </label>
                </div>
              )}

              {preview.errors.length > 0 && (
                <div style={{ marginTop: 10 }}>
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
        </div>

        {/* Modal Actions */}
        <div className="modal-actions" style={{ marginTop: 14 }}>
          {preview && (preview.collections.length > 0 || preview.environments.length > 0) && (
            <button className="btn primary" onClick={confirmImport} style={{ fontWeight: 700 }}>
              {targetMode === "existing"
                ? `Save into "${activeTargetCol?.name || "Collection"}"`
                : `Import ${preview.collections.length} Collection${preview.collections.length === 1 ? "" : "s"}${
                    preview.environments.length > 0 ? ` & ${preview.environments.length} Env` : ""
                  }`}
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
