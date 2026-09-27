import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AppData,
  Collection,
  Environment,
  ProxyResponse,
  RequestItem,
  RequestSnapshot,
  TabState,
  TreeNode,
} from "./types";
import { emptySnapshot, METHOD_COLORS, requestToSnapshot, snapshotToRequest } from "./types";
import { kv, uid } from "./id";
import { loadData, pushHistory, saveData } from "./storage";
import { findRequest, insertNode, removeNode, renameNode, updateRequest } from "./tree";
import { collectRequests, sendRequest } from "./request";
import {
  downloadJson,
  exportPostmanCollection,
  extractDocxText,
  importPostmanFile,
  parseDocToCollection,
} from "./importExport";
import { Sidebar } from "./components/Sidebar";
import { RequestPane } from "./components/RequestPane";
import { ResponsePane } from "./components/ResponsePane";
import { RunnerModal } from "./components/RunnerModal";
import { EnvModal } from "./components/EnvModal";
import { CurlModal } from "./components/CurlModal";
import { ImportModal } from "./components/ImportModal";
import { DashboardView } from "./components/DashboardView";
import { Footer } from "./components/Footer";
import { toCurl } from "./curl";

type ReqTab = "params" | "headers" | "body" | "auth";
export type ThemeMode = "blue" | "dark" | "light";

function blankTab(): TabState {
  return {
    id: uid("tab"),
    requestId: null,
    collectionId: null,
    name: "Untitled Request",
    dirty: false,
    draft: emptySnapshot(),
  };
}

function crumbPath(collections: Collection[], requestId: string | null): string {
  if (!requestId) return "Scratch pad";
  for (const col of collections) {
    const parts = findPath(col.children, requestId, [col.name]);
    if (parts && parts.length > 0) {
      const colName = parts[0];
      const reqName = parts[parts.length - 1];
      return parts.length > 1 ? `${colName} - ${reqName}` : colName;
    }
  }
  return "Request";
}

function findPath(nodes: TreeNode[], id: string, acc: string[]): string[] | null {
  for (const node of nodes) {
    if (node.type === "request" && node.id === id) return [...acc, node.name];
    if (node.type === "folder") {
      const hit = findPath(node.children, id, [...acc, node.name]);
      if (hit) return hit;
    }
  }
  return null;
}


export default function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [viewMode, setViewMode] = useState<"dashboard" | "studio">("dashboard");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("pulse_theme");
    if (saved === "blue" || saved === "dark" || saved === "light") return saved;
    return "blue";
  });
  const [tabs, setTabs] = useState<TabState[]>(() => [blankTab()]);
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);
  const [responses, setResponses] = useState<Record<string, ProxyResponse | null>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [reqTab, setReqTab] = useState<ReqTab>("params");
  const [savedLabel, setSavedLabel] = useState<string | null>(null);
  const [runnerCol, setRunnerCol] = useState<Collection | null>(null);
  const [envOpen, setEnvOpen] = useState(false);
  const [curlOpen, setCurlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importDropdownOpen, setImportDropdownOpen] = useState(false);
  const [snippetOpen, setSnippetOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importDropdownRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const activeEnv = data.environments.find((e) => e.id === data.activeEnvId) ?? null;

  const totalRequests = useMemo(
    () => data.collections.reduce((acc, c) => acc + collectRequests(c.children).length, 0),
    [data.collections]
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("pulse_theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!importDropdownOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (importDropdownRef.current && !importDropdownRef.current.contains(e.target as Node)) {
        setImportDropdownOpen(false);
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [importDropdownOpen]);

  useEffect(() => {
    saveData(data);
  }, [data]);

  const patchData = (patch: Partial<AppData> | ((prev: AppData) => AppData)) => {
    setData((prev) => (typeof patch === "function" ? patch(prev) : { ...prev, ...patch }));
  };

  const patchTab = (id: string, patch: Partial<TabState> | ((t: TabState) => TabState)) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? (typeof patch === "function" ? patch(t) : { ...t, ...patch }) : t))
    );
  };

  const openRequest = (collectionId: string, requestId: string) => {
    setViewMode("studio");
    const existing = tabs.find((t) => t.requestId === requestId);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const found = findRequest(data.collections, requestId);
    if (!found) return;
    const tab: TabState = {
      id: uid("tab"),
      requestId,
      collectionId,
      name: found.request.name,
      dirty: false,
      draft: requestToSnapshot(found.request),
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      if (prev.length === 1) {
        const t = blankTab();
        setActiveTabId(t.id);
        return [t];
      }
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        const neighbor = next[Math.max(0, idx - 1)];
        setActiveTabId(neighbor.id);
      }
      return next;
    });
  };

  const onDraftChange = (patch: Partial<RequestSnapshot>) => {
    if (!activeTab) return;
    patchTab(activeTab.id, (t) => {
      const draft = { ...t.draft, ...patch };
      return { ...t, draft, name: draft.name, dirty: true };
    });
  };

  const saveActive = () => {
    if (!activeTab) return;
    if (activeTab.requestId) {
      patchData((prev) => ({
        ...prev,
        collections: updateRequest(prev.collections, activeTab.requestId!, (req) =>
          snapshotToRequest(req.id, activeTab.draft)
        ),
      }));
      patchTab(activeTab.id, { dirty: false, name: activeTab.draft.name });
      flashSaved("Saved");
      return;
    }
    const colId = activeTab.collectionId ?? data.collections[0]?.id;
    if (!colId) {
      const col: Collection = {
        id: uid("col"),
        name: "My Collection",
        description: "",
        children: [],
      };
      const req = snapshotToRequest(uid("req"), activeTab.draft);
      patchData((prev) => ({
        ...prev,
        collections: [...prev.collections, { ...col, children: [req] }],
      }));
      patchTab(activeTab.id, { requestId: req.id, collectionId: col.id, dirty: false });
      flashSaved("Saved to My Collection");
      return;
    }
    const req = snapshotToRequest(uid("req"), activeTab.draft);
    patchData((prev) => ({
      ...prev,
      collections: insertNode(prev.collections, colId, null, req),
    }));
    patchTab(activeTab.id, { requestId: req.id, collectionId: colId, dirty: false });
    flashSaved("Saved");
  };

  const flashSaved = (msg: string) => {
    setSavedLabel(msg);
    window.setTimeout(() => setSavedLabel(null), 1600);
  };

  const getActiveCollection = (tab: TabState | null): Collection | null => {
    if (!tab) return null;
    if (tab.collectionId) {
      const byId = data.collections.find((c) => c.id === tab.collectionId);
      if (byId) return byId;
    }
    if (tab.requestId) {
      const hit = findRequest(data.collections, tab.requestId);
      if (hit) return hit.collection;
    }
    return null;
  };

  const sendActive = async () => {
    if (!activeTab) return;
    const tabId = activeTab.id;
    const activeCol = getActiveCollection(activeTab);
    setSending((s) => ({ ...s, [tabId]: true }));
    try {
      const resp = await sendRequest(activeTab.draft, activeEnv, activeCol);
      setResponses((r) => ({ ...r, [tabId]: resp }));
      patchData((prev) => ({
        ...prev,
        history: pushHistory(prev.history, {
          id: uid("hist"),
          timestamp: Date.now(),
          method: activeTab.draft.method,
          url: activeTab.draft.url,
          status: resp.status,
          time: resp.time,
          ok: resp.ok,
          error: resp.error,
        }),
      }));
    } catch (err) {
      setResponses((r) => ({
        ...r,
        [tabId]: {
          ok: false,
          error: true,
          status: 0,
          statusText: "Error",
          headers: {},
          body: err instanceof Error ? err.message : String(err),
          time: 0,
          size: 0,
        },
      }));
    } finally {
      setSending((s) => ({ ...s, [tabId]: false }));
    }
  };

  const newCollection = () => {
    const name = window.prompt("Collection name", "New Collection");
    if (!name) return;
    const col: Collection = { id: uid("col"), name, description: "", children: [] };
    patchData((prev) => ({ ...prev, collections: [...prev.collections, col] }));
  };

  const createNewRequest = (type: "http" | "websocket" | "graphql" | "mock" = "http") => {
    let colId = data.collections[0]?.id;
    if (!colId) {
      const newCol: Collection = { id: uid("col"), name: "Default Collection", description: "", children: [] };
      patchData((prev) => ({ ...prev, collections: [...prev.collections, newCol] }));
      colId = newCol.id;
    }

    let snap: RequestSnapshot;
    if (type === "websocket") {
      snap = emptySnapshot({
        name: "New WebSocket Request",
        method: "WS",
        url: "wss://echo.websocket.org",
      });
    } else if (type === "graphql") {
      snap = emptySnapshot({
        name: "GraphQL Query",
        method: "POST",
        url: "https://countries.trevorblades.com/",
        bodyMode: "json",
        body: JSON.stringify(
          {
            query: "query {\n  countries {\n    code\n    name\n    emoji\n  }\n}",
          },
          null,
          2
        ),
      });
    } else if (type === "mock") {
      snap = emptySnapshot({
        name: "Local Mock Health Check",
        method: "GET",
        url: "http://localhost:3001/api/health",
      });
    } else {
      snap = emptySnapshot({
        name: "New HTTP Request",
        method: "GET",
        url: "",
      });
    }

    const req: RequestItem = snapshotToRequest(uid("req"), snap);
    patchData((prev) => ({
      ...prev,
      collections: insertNode(prev.collections, colId!, null, req),
    }));
    const tab: TabState = {
      id: uid("tab"),
      requestId: req.id,
      collectionId: colId!,
      name: req.name,
      dirty: false,
      draft: snap,
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setViewMode("studio");
  };

  const createNewEnvironment = () => {
    const name = window.prompt("Environment name", "New Environment");
    if (!name) return;
    const env: Environment = {
      id: uid("env"),
      name,
      variables: [
        kv("baseUrl", "http://localhost:8080"),
        kv("apiKey", "secret-token-123"),
      ],
    };
    patchData((prev) => ({
      ...prev,
      environments: [...prev.environments, env],
      activeEnvId: env.id,
    }));
    setEnvOpen(true);
    flashImport(`Created environment "${name}"`);
  };

  const newRequest = (collectionId: string, folderId: string | null) => {
    const req: RequestItem = snapshotToRequest(uid("req"), emptySnapshot({ name: "New Request" }));
    patchData((prev) => ({
      ...prev,
      collections: insertNode(prev.collections, collectionId, folderId, req),
    }));
    const tab: TabState = {
      id: uid("tab"),
      requestId: req.id,
      collectionId,
      name: req.name,
      dirty: false,
      draft: requestToSnapshot(req),
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const newFolder = (collectionId: string, folderId: string | null = null) => {
    const name = window.prompt("Folder name", "New Folder");
    if (!name) return;
    const folder: TreeNode = { id: uid("fld"), type: "folder", name, children: [] };
    patchData((prev) => ({
      ...prev,
      collections: insertNode(prev.collections, collectionId, folderId, folder),
    }));
  };

  const renameCollection = (id: string) => {
    const col = data.collections.find((c) => c.id === id);
    const name = window.prompt("Rename collection", col?.name ?? "");
    if (!name) return;
    patchData((prev) => ({
      ...prev,
      collections: prev.collections.map((c) => (c.id === id ? { ...c, name } : c)),
    }));
  };

  const deleteCollection = (id: string) => {
    if (!window.confirm("Delete this collection?")) return;
    patchData((prev) => ({
      ...prev,
      collections: prev.collections.filter((c) => c.id !== id),
    }));
    setTabs((prev) =>
      prev.map((t) =>
        t.collectionId === id ? { ...t, requestId: null, collectionId: null, dirty: true } : t
      )
    );
  };

  const exportCol = (id: string) => {
    const col = data.collections.find((c) => c.id === id);
    if (!col) return;
    downloadJson(
      `${col.name.replace(/\s+/g, "-").toLowerCase()}.postman_collection.json`,
      exportPostmanCollection(col)
    );
    flashImport(`Exported "${col.name}"`);
  };

  const flashImport = (msg: string) => {
    setImportNotice(msg);
    window.setTimeout(() => setImportNotice(null), 3200);
  };

  const importFile = async (file: File, preferEnv = false) => {
    try {
      const isDoc = file.name.match(/\.(md|markdown|txt|doc|docx)$/i);
      if (isDoc) {
        let text = "";
        if (file.name.toLowerCase().endsWith(".docx")) {
          text = await extractDocxText(await file.arrayBuffer());
        } else {
          text = await file.text();
        }
        const col = parseDocToCollection(text, file.name);
        if (col.children.length === 0) {
          throw new Error("Could not find any API endpoints, cURL commands, or URLs in this document.");
        }
        patchData((prev) => ({ ...prev, collections: [...prev.collections, col] }));
        flashImport(`Imported collection "${col.name}" with ${col.children.length} endpoint(s)`);
        return;
      }

      const text = await file.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        // Fallback: If not valid JSON, check if it's text/markdown with endpoints
        const col = parseDocToCollection(text, file.name);
        if (col.children.length > 0) {
          patchData((prev) => ({ ...prev, collections: [...prev.collections, col] }));
          flashImport(`Imported collection "${col.name}" with ${col.children.length} endpoint(s)`);
          return;
        }
        throw new Error("Invalid JSON and no API endpoints detected.");
      }

      const looksEnv =
        preferEnv ||
        /environment|globals/i.test(file.name) ||
        (json &&
          typeof json === "object" &&
          ("values" in (json as object) || "_postman_variable_scope" in (json as object)) &&
          !("item" in (json as object)));
      const result = importPostmanFile(json);
      if (result.kind === "environment" && result.environment) {
        const env = result.environment;
        patchData((prev) => ({
          ...prev,
          environments: [...prev.environments, env],
          activeEnvId: env.id,
        }));
        flashImport(`Imported environment "${env.name}"`);
        return;
      }
      if (looksEnv && result.kind === "collection") {
        throw new Error("This file looks like an environment but could not be parsed as one.");
      }
      if (result.collection) {
        const col = result.collection;
        patchData((prev) => ({ ...prev, collections: [...prev.collections, col] }));
        flashImport(`Imported collection "${col.name}"`);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Import failed");
    }
  };

  const importCurl = (snap: RequestSnapshot) => {
    const tab: TabState = {
      id: uid("tab"),
      requestId: null,
      collectionId: data.collections[0]?.id ?? null,
      name: snap.name,
      dirty: true,
      draft: snap,
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setCurlOpen(false);
    flashImport(`Imported cURL as "${snap.name}" — Save to keep it`);
  };

  const copyCurl = async () => {
    if (!activeTab) return;
    try {
      const activeCol = getActiveCollection(activeTab);
      await navigator.clipboard.writeText(toCurl(activeTab.draft, activeEnv, activeCol));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      window.alert("Could not copy to clipboard");
    }
  };

  const activeCol = getActiveCollection(activeTab);
  const crumbs = crumbPath(data.collections, activeTab?.requestId ?? null);
  const envOptions = useMemo(() => data.environments, [data.environments]);
  const snippet = activeTab ? toCurl(activeTab.draft, activeEnv, activeCol) : "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void sendActive();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveActive();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="app">
      <header className="topbar">
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileSidebarOpen((prev) => !prev)}
          title="Toggle Navigation Menu"
          aria-label="Toggle Navigation Menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div className="brand" onClick={() => setViewMode("dashboard")} style={{ cursor: "pointer" }}>
          <img src="./logo.png" alt="Pulse API Studio" className="brand-logo-img" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: "-0.01em" }}>Pulse API Studio</span>
            <span style={{ fontSize: 10, color: "var(--text-mute)", fontWeight: 500 }}>API Engine</span>
          </div>
        </div>

        <div className="view-mode-tabs">
          <button
            className={`view-tab ${viewMode === "dashboard" ? "active" : ""}`}
            onClick={() => setViewMode("dashboard")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
            Dashboard
          </button>
          <button
            className={`view-tab ${viewMode === "studio" ? "active" : ""}`}
            onClick={() => setViewMode("studio")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Studio ({tabs.length})
          </button>
        </div>

        <div className="top-env-container">
          <select
            className="env-select"
            value={data.activeEnvId ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "__NEW_ENV__") {
                createNewEnvironment();
              } else if (val === "__MANAGE_ENV__") {
                setEnvOpen(true);
              } else {
                patchData({ activeEnvId: val || null });
              }
            }}
          >
            <option value="">No environment</option>
            {envOptions.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name}
              </option>
            ))}
            <option disabled>──────────</option>
            <option value="__NEW_ENV__">+ Add New Environment...</option>
            <option value="__MANAGE_ENV__">⚙ Manage Environments...</option>
          </select>
          <button
            className="top-env-add-btn"
            title="Add new environment"
            onClick={createNewEnvironment}
          >
            +
          </button>
        </div>
        <div className="top-actions">
          {importNotice && <span className="toast">{importNotice}</span>}

          {/* Unified Import Dropdown */}
          <div className="top-dropdown-wrapper" ref={importDropdownRef}>
            <button
              className="btn primary top-import-btn"
              onClick={() => setImportDropdownOpen((prev) => !prev)}
              title="Import API Collections, Specs, cURL, or Documents"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Import</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {importDropdownOpen && (
              <div className="top-dropdown-menu">
                <button
                  className="top-dropdown-item"
                  onClick={() => {
                    setImportDropdownOpen(false);
                    setImportOpen(true);
                  }}
                >
                  <div className="top-dropdown-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="12" y1="18" x2="12" y2="12" />
                      <line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                  </div>
                  <div className="top-dropdown-text">
                    <span className="top-dropdown-title">Import Collection or Doc</span>
                    <span className="top-dropdown-desc">Postman, OpenAPI/Swagger, Markdown (.md), or Word Doc (.docx)</span>
                  </div>
                </button>

                <button
                  className="top-dropdown-item"
                  onClick={() => {
                    setImportDropdownOpen(false);
                    setCurlOpen(true);
                  }}
                >
                  <div className="top-dropdown-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="4 17 10 11 4 5" />
                      <line x1="12" y1="19" x2="20" y2="19" />
                    </svg>
                  </div>
                  <div className="top-dropdown-text">
                    <span className="top-dropdown-title">Import from cURL</span>
                    <span className="top-dropdown-desc">Paste raw cURL command to generate request</span>
                  </div>
                </button>

                <div className="top-dropdown-divider" />

                <button
                  className="top-dropdown-item"
                  onClick={() => {
                    setImportDropdownOpen(false);
                    fileRef.current?.click();
                  }}
                >
                  <div className="top-dropdown-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <div className="top-dropdown-text">
                    <span className="top-dropdown-title">Quick File Upload</span>
                    <span className="top-dropdown-desc">Directly pick file from system</span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Theme Switcher: Dark, Light, Blue (Default) */}
          <div className="theme-switcher" title="Change Theme: Blue (Default), Dark, Light">
            <div className="theme-switcher-icon">
              {theme === "blue" ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m4.93 4.93 4.24 4.24" />
                  <path d="m14.83 9.17 4.24-4.24" />
                  <path d="m14.83 14.83 4.24 4.24" />
                  <path d="m9.17 14.83-4.24 4.24" />
                  <circle cx="12" cy="12" r="4" />
                </svg>
              ) : theme === "dark" ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2" />
                  <path d="M12 20v2" />
                  <path d="m4.93 4.93 1.41 1.41" />
                  <path d="m17.66 17.66 1.41 1.41" />
                  <path d="M2 12h2" />
                  <path d="M20 12h2" />
                  <path d="m6.34 17.66-1.41 1.41" />
                  <path d="m19.07 4.93-1.41 1.41" />
                </svg>
              )}
            </div>
            <select
              className="theme-select"
              value={theme}
              onChange={(e) => setTheme(e.target.value as ThemeMode)}
              aria-label="Select Theme"
            >
              <option value="blue">Blue (Default)</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
          <input
            ref={fileRef}
            className="hidden-file"
            type="file"
            multiple
            accept="application/json,.json,.md,.markdown,.doc,.docx,.txt,text/markdown,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = "";
            }}
          />
          {viewMode === "studio" && (
            <button className="btn ghost" onClick={() => setSnippetOpen((v) => !v)}>
              {snippetOpen ? "Hide code" : "Code"}
            </button>
          )}

          {/* Download Desktop App button on topbar corner */}
          <a
            href="https://drive.usercontent.google.com/download?id=19j8N3pDuqN0C4uWIcdV29FT7oM9FR0hw&export=download&authuser=0"
            target="_blank"
            rel="noopener noreferrer"
            className="top-download-btn"
            title="Download Pulse Desktop App (pulse.zip)"
            aria-label="Download Desktop App"
            onClick={() => {
              flashImport("Opening download link for Pulse API Studio (pulse.zip)...");
            }}
          >
            <span className="top-download-icon">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </span>
            <span className="top-download-text">Download</span>
            <span className="top-download-badge">ZIP</span>
          </a>
        </div>
      </header>
      <div className={`layout ${viewMode === "studio" && snippetOpen ? "with-snippet" : ""}`}>
        {mobileSidebarOpen && (
          <div
            className="mobile-sidebar-backdrop"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close menu overlay"
          />
        )}
        <Sidebar
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          viewMode={viewMode}
          onSelectDashboard={() => {
            setViewMode("dashboard");
            setMobileSidebarOpen(false);
          }}
          collections={data.collections}
          environments={data.environments}
          activeEnvId={data.activeEnvId}
          activeRequestId={activeTab?.requestId ?? null}
          onOpenRequest={(cId, rId) => {
            openRequest(cId, rId);
            setMobileSidebarOpen(false);
          }}
          onNewCollection={newCollection}
          onNewRequest={newRequest}
          onNewRequestType={createNewRequest}
          onNewFolder={newFolder}
          onRenameCollection={renameCollection}
          onDeleteCollection={deleteCollection}
          onExportCollection={exportCol}
          onRunCollection={(id) => {
            const col = data.collections.find((c) => c.id === id);
            if (col) setRunnerCol(col);
          }}
          onRenameNode={(id) => {
            const name = window.prompt("Rename");
            if (!name) return;
            patchData((prev) => ({ ...prev, collections: renameNode(prev.collections, id, name) }));
            setTabs((prev) =>
              prev.map((t) => (t.requestId === id ? { ...t, name, draft: { ...t.draft, name } } : t))
            );
          }}
          onDeleteNode={(id) => {
            patchData((prev) => ({ ...prev, collections: removeNode(prev.collections, id) }));
            setTabs((prev) =>
              prev.map((t) =>
                t.requestId === id ? { ...t, requestId: null, collectionId: null, dirty: true } : t
              )
            );
          }}
          onImportClick={() => setImportOpen(true)}
          onImportCurl={() => setCurlOpen(true)}
          onSelectEnv={(id) => patchData({ activeEnvId: id })}
          onManageEnv={() => setEnvOpen(true)}
          onNewEnv={createNewEnvironment}
        />
        {viewMode === "dashboard" ? (
          <DashboardView
            collections={data.collections}
            environments={data.environments}
            activeEnvId={data.activeEnvId}
            history={data.history}
            onSelectEnv={(id) => patchData({ activeEnvId: id })}
            onOpenRequest={(colId, reqId) => openRequest(colId, reqId)}
            onRunCollection={(col) => setRunnerCol(col)}
            onNewRequest={() => {
              newRequest(data.collections[0]?.id || "", null);
              setViewMode("studio");
            }}
            onImportClick={() => setImportOpen(true)}
            onManageEnv={() => setEnvOpen(true)}
            onClearHistory={() => patchData({ history: [] })}
            onSwitchToStudio={() => setViewMode("studio")}
          />
        ) : (
          <>
            <main className="workspace">
              <div className="tabs">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    className={`tab ${t.id === activeTabId ? "active" : ""}`}
                    onClick={() => setActiveTabId(t.id)}
                  >
                    <span className={`method ${METHOD_COLORS[t.draft.method]}`}>
                      {t.draft.method === "DELETE" ? "DEL" : t.draft.method}
                    </span>
                    <span className="tname">
                      {t.dirty && <span className="dirty">• </span>}
                      {t.name}
                    </span>
                    <span
                      className="tab-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(t.id);
                      }}
                    >
                      x
                    </span>
                  </button>
                ))}
                <button
                  className="tab-add"
                  onClick={() => {
                    const t = blankTab();
                    setTabs((prev) => [...prev, t]);
                    setActiveTabId(t.id);
                  }}
                >
                  +
                </button>
              </div>
              {activeTab && (
                <div className="req-crumbbar">
                  <div className="crumbs">{crumbs}</div>
                  <button className="btn sm" onClick={saveActive}>Save</button>
                  {savedLabel && <span className="save-hint">{savedLabel}</span>}
                  {activeTab.dirty && <span className="save-hint">Unsaved</span>}
                </div>
              )}
              {activeTab && (
                <div className="editor">
                  <RequestPane
                    draft={activeTab.draft}
                    sending={Boolean(sending[activeTab.id])}
                    reqTab={reqTab}
                    onReqTab={setReqTab}
                    onChange={onDraftChange}
                    onSend={() => void sendActive()}
                    envName={activeEnv?.name ?? null}
                    env={activeEnv}
                    collection={activeCol}
                  />
                  <ResponsePane
                    response={responses[activeTab.id] ?? null}
                    sending={Boolean(sending[activeTab.id])}
                  />
                </div>
              )}
            </main>
            {snippetOpen && (
              <aside className="snippet">
                <div className="snippet-head">
                  <span>Code snippet</span>
                  <select defaultValue="curl" className="snippet-lang">
                    <option value="curl">cURL</option>
                  </select>
                  <button className="btn sm ghost" onClick={() => void copyCurl()}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="snippet-body">{snippet}</pre>
              </aside>
            )}
          </>
        )}
      </div>
      <Footer
        activeEnvName={activeEnv?.name ?? null}
        collectionsCount={data.collections.length}
        requestsCount={totalRequests}
        viewMode={viewMode}
        onSwitchView={setViewMode}
      />
      {runnerCol && (
        <RunnerModal
          collection={runnerCol}
          environments={data.environments}
          activeEnvId={data.activeEnvId}
          env={activeEnv}
          onSelectEnv={(id) => patchData({ activeEnvId: id })}
          onClose={() => setRunnerCol(null)}
        />
      )}
      {envOpen && (
        <EnvModal
          environments={data.environments}
          activeEnvId={data.activeEnvId}
          onChange={(environments) => patchData({ environments })}
          onActive={(activeEnvId) => patchData({ activeEnvId })}
          onImportEnv={(file) => void importFile(file, true)}
          onClose={() => setEnvOpen(false)}
        />
      )}
      {curlOpen && <CurlModal onImport={importCurl} onClose={() => setCurlOpen(false)} />}
      {importOpen && (
        <ImportModal
          onImportSuccess={({ collections, environments, message }) => {
            patchData((prev) => ({
              ...prev,
              collections: [...prev.collections, ...collections],
              environments: [...prev.environments, ...environments],
              activeEnvId: environments[0]?.id ?? prev.activeEnvId,
            }));
            flashImport(message);
          }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
