import { useState, type FC } from "react";
import type { Collection, KeyValue } from "../types";
import { KeyValueEditor } from "./KeyValueEditor";
import { collectRequests } from "../request";

export type CollectionTab = "scripts-pre" | "scripts-post" | "variables" | "overview";

interface Props {
  collection: Collection;
  isOpen: boolean;
  initialTab?: CollectionTab;
  onClose: () => void;
  onSave: (updated: Collection) => void;
}

export const CollectionModal: FC<Props> = ({
  collection,
  isOpen,
  initialTab = "scripts-pre",
  onClose,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<CollectionTab>(initialTab);
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description || "");
  const [preScript, setPreScript] = useState(collection.preScript || "");
  const [postScript, setPostScript] = useState(collection.postScript || "");
  const [variables, setVariables] = useState<KeyValue[]>(collection.variables || []);

  if (!isOpen) return null;

  const totalRequests = collectRequests(collection.children).length;
  const hasPreScript = Boolean(preScript && preScript.trim());
  const hasPostScript = Boolean(postScript && postScript.trim());
  const varCount = variables.filter((v) => v.key && v.key.trim()).length;

  const handleSave = () => {
    onSave({
      ...collection,
      name: name.trim() || collection.name,
      description,
      preScript: preScript.trim() || undefined,
      postScript: postScript.trim() || undefined,
      variables,
    });
    onClose();
  };

  const insertSnippet = (snippet: string, target: "pre" | "post") => {
    if (target === "pre") {
      setPreScript((prev) => (prev ? `${prev}\n\n${snippet}` : snippet));
    } else {
      setPostScript((prev) => (prev ? `${prev}\n\n${snippet}` : snippet));
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const val = target.value;
      target.value = val.substring(0, start) + "    " + val.substring(end);
      target.selectionStart = target.selectionEnd = start + 4;
      setter(target.value);
    }
  };

  return (
    <div className="modal-backdrop collection-modal-backdrop" onClick={onClose}>
      <div
        className="modal collection-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 900,
          width: "95%",
          height: "85vh",
          maxHeight: 740,
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          className="collection-modal-head"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                fontSize: 22,
                display: "grid",
                placeItems: "center",
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--accent-soft)",
              }}
            >
              📁
            </span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{name || "Collection Settings"}</h2>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 12,
                    background: "var(--bg-3)",
                    color: "var(--text-dim)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {totalRequests} {totalRequests === 1 ? "request" : "requests"}
                </span>
              </div>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                Configure collection-wide scripts (Pre-request &amp; Tests) and scoped variables, similar to Postman.
              </p>
            </div>
          </div>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-dim)",
              fontSize: 18,
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div
          className="collection-modal-tabs"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "0 16px",
            background: "var(--bg-2)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            className={`tab-btn ${activeTab === "scripts-pre" ? "active" : ""}`}
            onClick={() => setActiveTab("scripts-pre")}
            style={{
              padding: "10px 14px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "scripts-pre" ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === "scripts-pre" ? "var(--text)" : "var(--text-dim)",
              fontWeight: activeTab === "scripts-pre" ? 600 : 500,
              fontSize: 12.5,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>⚡ Pre-request Scripts</span>
            {hasPreScript && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--accent)",
                }}
              />
            )}
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === "scripts-post" ? "active" : ""}`}
            onClick={() => setActiveTab("scripts-post")}
            style={{
              padding: "10px 14px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "scripts-post" ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === "scripts-post" ? "var(--text)" : "var(--text-dim)",
              fontWeight: activeTab === "scripts-post" ? 600 : 500,
              fontSize: 12.5,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>🧪 Tests (Post-response)</span>
            {hasPostScript && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#10b981",
                }}
              />
            )}
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === "variables" ? "active" : ""}`}
            onClick={() => setActiveTab("variables")}
            style={{
              padding: "10px 14px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "variables" ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === "variables" ? "var(--text)" : "var(--text-dim)",
              fontWeight: activeTab === "variables" ? 600 : 500,
              fontSize: 12.5,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>🏷️ Variables</span>
            {varCount > 0 && (
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 6px",
                  borderRadius: 10,
                  background: "var(--bg-4)",
                  color: "var(--text)",
                }}
              >
                {varCount}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
            style={{
              padding: "10px 14px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "overview" ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === "overview" ? "var(--text)" : "var(--text-dim)",
              fontWeight: activeTab === "overview" ? 600 : 500,
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            ℹ️ Overview
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
          {/* TAB 1: Pre-request Script */}
          {activeTab === "scripts-pre" && (
            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
              {/* Left sidebar: snippets & execution flow */}
              <div
                style={{
                  width: 240,
                  minWidth: 220,
                  borderRight: "1px solid var(--border)",
                  background: "var(--bg-2)",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  overflowY: "auto",
                }}
              >
                <div
                  style={{
                    background: "var(--bg-3)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "10px 12px",
                    fontSize: 11.5,
                  }}
                >
                  <div style={{ fontWeight: 600, color: "var(--accent)", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                    <span>⚡</span> Execution Order
                  </div>
                  <div style={{ color: "var(--text-dim)", lineHeight: 1.45, fontSize: 11 }}>
                    Runs <b>before</b> every request in this collection, preceding request-level pre-scripts.
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      padding: "6px 8px",
                      background: "var(--bg-1)",
                      borderRadius: 4,
                      fontFamily: "var(--code-font-family, monospace)",
                      fontSize: 10,
                      color: "var(--text-dim)",
                      lineHeight: 1.4,
                    }}
                  >
                    1. <span style={{ color: "var(--accent)", fontWeight: 700 }}>Col Pre-script</span><br/>
                    2. Req Pre-script<br/>
                    3. Network Request
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      color: "var(--text-dim)",
                      marginBottom: 8,
                    }}
                  >
                    Code Snippets
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <button
                      type="button"
                      className="snippet-item-btn"
                      onClick={() =>
                        insertSnippet(
                          '// Set an environment variable\npm.environment.set("currentTimestamp", Date.now().toString());',
                          "pre"
                        )
                      }
                      title="Set dynamic timestamp variable"
                    >
                      + Set timestamp variable
                    </button>
                    <button
                      type="button"
                      className="snippet-item-btn"
                      onClick={() =>
                        insertSnippet(
                          '// Generate dynamic UUID\nconst uuid = "uuid-" + Math.random().toString(36).substring(2, 10);\npm.environment.set("requestId", uuid);',
                          "pre"
                        )
                      }
                      title="Generate dynamic UUID and store in environment"
                    >
                      + Generate request UUID
                    </button>
                    <button
                      type="button"
                      className="snippet-item-btn"
                      onClick={() =>
                        insertSnippet(
                          '// Add/Upsert a global header across all requests\npm.request.headers.upsert({ key: "X-Client-Version", value: "1.0.0" });',
                          "pre"
                        )
                      }
                      title="Add or update header across collection"
                    >
                      + Add global header
                    </button>
                    <button
                      type="button"
                      className="snippet-item-btn"
                      onClick={() =>
                        insertSnippet(
                          '// Log debug info for collection run\nconsole.log("[Col Pre-request] Executing for:", pm.request.method, pm.request.url);',
                          "pre"
                        )
                      }
                      title="Log diagnostic info to console"
                    >
                      + Log request info
                    </button>
                    <button
                      type="button"
                      className="snippet-item-btn"
                      onClick={() =>
                        insertSnippet(
                          '// Clear variable\npm.environment.unset("tempAuthToken");',
                          "pre"
                        )
                      }
                      title="Clear variable from environment"
                    >
                      + Clear variable
                    </button>
                  </div>
                </div>
              </div>

              {/* Right editor */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 16px",
                    background: "var(--bg-2)",
                    borderBottom: "1px solid var(--border)",
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="badge-tag">JavaScript</span>
                    <span style={{ fontWeight: 600, color: "var(--text)" }}>Collection Pre-request Script</span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                    {hasPreScript ? "✓ Script active" : "Optional script executed before sending each request"}
                  </span>
                </div>
                <div style={{ flex: 1, position: "relative" }}>
                  <textarea
                    className="scripts-textarea"
                    spellCheck={false}
                    value={preScript}
                    placeholder={`// Write JavaScript to execute before EVERY request in "${name}".\n// Available APIs: pm.environment.get/set, pm.variables.get/set, pm.request.headers.upsert, console.log\n\n// Example: Auto-inject timestamp\npm.environment.set("timestamp", Date.now().toString());`}
                    onChange={(e) => setPreScript(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, setPreScript)}
                    style={{
                      width: "100%",
                      height: "100%",
                      border: "none",
                      outline: "none",
                      resize: "none",
                      padding: 16,
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontFamily: "var(--code-font-family, monospace)",
                      fontSize: 12,
                      lineHeight: 1.55,
                      tabSize: 4,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Post-response (Tests) Script */}
          {activeTab === "scripts-post" && (
            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
              {/* Left sidebar: snippets & execution flow */}
              <div
                style={{
                  width: 240,
                  minWidth: 220,
                  borderRight: "1px solid var(--border)",
                  background: "var(--bg-2)",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  overflowY: "auto",
                }}
              >
                <div
                  style={{
                    background: "var(--bg-3)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "10px 12px",
                    fontSize: 11.5,
                  }}
                >
                  <div style={{ fontWeight: 600, color: "#10b981", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                    <span>🧪</span> Execution Order
                  </div>
                  <div style={{ color: "var(--text-dim)", lineHeight: 1.45, fontSize: 11 }}>
                    Runs <b>after</b> every response in this collection. Request tests run first, then collection tests.
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      padding: "6px 8px",
                      background: "var(--bg-1)",
                      borderRadius: 4,
                      fontFamily: "var(--code-font-family, monospace)",
                      fontSize: 10,
                      color: "var(--text-dim)",
                      lineHeight: 1.4,
                    }}
                  >
                    1. Network Response<br/>
                    2. Req Tests<br/>
                    3. <span style={{ color: "#10b981", fontWeight: 700 }}>Col Tests (Global)</span>
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      color: "var(--text-dim)",
                      marginBottom: 8,
                    }}
                  >
                    Test Snippets
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <button
                      type="button"
                      className="snippet-item-btn"
                      onClick={() =>
                        insertSnippet(
                          'pm.test("Status code is 200", function () {\n    pm.response.to.have.status(200);\n});',
                          "post"
                        )
                      }
                      title="Assert HTTP 200 OK"
                    >
                      + Status code is 200
                    </button>
                    <button
                      type="button"
                      className="snippet-item-btn"
                      onClick={() =>
                        insertSnippet(
                          'pm.test("Status code is 2xx (Success)", function () {\n    pm.response.to.be.success;\n});',
                          "post"
                        )
                      }
                      title="Assert any 2xx status code"
                    >
                      + Status is 2xx (Success)
                    </button>
                    <button
                      type="button"
                      className="snippet-item-btn"
                      onClick={() =>
                        insertSnippet(
                          'pm.test("Response time is less than 500ms", function () {\n    pm.expect(pm.response.responseTime).to.be.below(500);\n});',
                          "post"
                        )
                      }
                      title="Assert response latency below 500ms"
                    >
                      + Response time &lt; 500ms
                    </button>
                    <button
                      type="button"
                      className="snippet-item-btn"
                      onClick={() =>
                        insertSnippet(
                          'pm.test("Response has JSON body", function () {\n    const data = pm.response.json();\n    pm.expect(data).to.be.an("object");\n});',
                          "post"
                        )
                      }
                      title="Assert response contains valid JSON object"
                    >
                      + Valid JSON body check
                    </button>
                    <button
                      type="button"
                      className="snippet-item-btn"
                      onClick={() =>
                        insertSnippet(
                          '// Extract bearer or session token if present\ntry {\n    const data = pm.response.json();\n    if (data && data.token) {\n        pm.environment.set("authToken", data.token);\n        console.log("Updated authToken in environment");\n    }\n} catch (e) {}',
                          "post"
                        )
                      }
                      title="Extract auth token to environment"
                    >
                      + Extract token to env
                    </button>
                    <button
                      type="button"
                      className="snippet-item-btn"
                      onClick={() =>
                        insertSnippet(
                          'pm.test("Content-Type header is JSON", function () {\n    pm.response.to.have.header("content-type");\n    pm.expect(pm.response.headers.get("content-type")).to.include("application/json");\n});',
                          "post"
                        )
                      }
                      title="Verify Content-Type header"
                    >
                      + Verify JSON Header
                    </button>
                  </div>
                </div>
              </div>

              {/* Right editor */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 16px",
                    background: "var(--bg-2)",
                    borderBottom: "1px solid var(--border)",
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="badge-tag">JavaScript</span>
                    <span style={{ fontWeight: 600, color: "var(--text)" }}>Collection Post-response Tests</span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                    {hasPostScript ? "✓ Tests active" : "Assertions execute after every request in this collection"}
                  </span>
                </div>
                <div style={{ flex: 1, position: "relative" }}>
                  <textarea
                    className="scripts-textarea"
                    spellCheck={false}
                    value={postScript}
                    placeholder={`// Write JavaScript assertions to execute after EVERY response in "${name}".\n// Available APIs: pm.test, pm.expect, pm.response, pm.environment, console.log\n\n// Example: Global status assertion\npm.test("Global Status Check: 2xx Success", function () {\n    pm.response.to.be.success;\n});`}
                    onChange={(e) => setPostScript(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, setPostScript)}
                    style={{
                      width: "100%",
                      height: "100%",
                      border: "none",
                      outline: "none",
                      resize: "none",
                      padding: 16,
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontFamily: "var(--code-font-family, monospace)",
                      fontSize: 12,
                      lineHeight: 1.55,
                      tabSize: 4,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Variables */}
          {activeTab === "variables" && (
            <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: "0 0 4px", fontSize: 14 }}>Collection Variables</h3>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                  Variables defined here are scoped to all requests within this collection. Use <code>{"{{variableName}}"}</code> in URLs, headers, and bodies.
                  Environment variables take precedence if keys collide.
                </p>
              </div>
              <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, padding: 12 }}>
                <KeyValueEditor
                  rows={variables}
                  onChange={setVariables}
                  keyPlaceholder="Variable (e.g. apiVersion)"
                  valuePlaceholder="Initial Value (e.g. v1)"
                />
              </div>
            </div>
          )}

          {/* TAB 4: Overview */}
          {activeTab === "overview" && (
            <div style={{ flex: 1, padding: 24, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text)" }}>
                  Collection Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: "100%",
                    maxWidth: 480,
                    padding: "8px 12px",
                    background: "var(--bg-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text)" }}>
                  Description / Documentation
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe this collection's endpoints, authentication requirements, and test scenarios..."
                  style={{
                    width: "100%",
                    maxWidth: 600,
                    padding: "8px 12px",
                    background: "var(--bg-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                    fontSize: 12.5,
                    resize: "vertical",
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: 10,
                  maxWidth: 600,
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "14px 18px",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 16,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Total Requests</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginTop: 2 }}>{totalRequests}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Pre-request Script</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: hasPreScript ? "var(--accent)" : "var(--text-dim)", marginTop: 4 }}>
                    {hasPreScript ? "✓ Configured" : "None"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Post-response Tests</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: hasPostScript ? "#10b981" : "var(--text-dim)", marginTop: 4 }}>
                    {hasPostScript ? "✓ Configured" : "None"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className="collection-modal-foot"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
            padding: "12px 20px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-2)",
          }}
        >
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleSave}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
