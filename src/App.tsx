import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AppData,
  Collection,
  ConsoleLog,
  Environment,
  KeyValue,
  ProxyResponse,
  RequestItem,
  RequestSnapshot,
  TabState,
  TreeNode,
} from "./types";
import { emptySnapshot, METHOD_COLORS, requestToSnapshot, snapshotToRequest } from "./types";
import { kv, uid } from "./id";
import {
  createSampleCollections,
  createSampleEnvironments,
  loadData,
  pushHistory,
  saveData,
} from "./storage";
import {
  duplicateCollection,
  duplicateEnvironment,
  duplicateNode,
  findRequest,
  insertNode,
  parentFolderId,
  removeNode,
  renameNode,
  updateRequest,
} from "./tree";
import { buildOutbound, collectRequests, sendRequest } from "./request";
import {
  downloadJson,
  exportPostmanCollection,
  extractDocxText,
  importPostmanFile,
  parseDocToCollection,
} from "./importExport";
import { Sidebar } from "./components/Sidebar";
import { RequestPane, type ReqTab } from "./components/RequestPane";
import { ResponsePane } from "./components/ResponsePane";
import { RunnerModal } from "./components/RunnerModal";
import { CollectionModal, type CollectionTab } from "./components/CollectionModal";
import { EnvModal } from "./components/EnvModal";
import { CurlModal, type CurlImportTarget } from "./components/CurlModal";
import { ImportModal } from "./components/ImportModal";
import { DashboardView } from "./components/DashboardView";
import { Footer } from "./components/Footer";
import { ConsoleDrawer } from "./components/ConsoleDrawer";
import { AppleWelcomeModal } from "./components/AppleWelcomeModal";
import { DownloadModal } from "./components/DownloadModal";
import {
  SettingsModal,
  type FontSettings,
  type PanelLayoutMode,
  FONT_FAMILY_PRESETS,
  CODE_FONT_PRESETS,
} from "./components/SettingsModal";
import { toCurl } from "./curl";

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
  const [viewMode, setViewMode] = useState<"dashboard" | "studio">(() => {
    const saved = localStorage.getItem("pulse_view_mode");
    if (saved === "dashboard" || saved === "studio") return saved;
    return "studio";
  });

  const switchViewMode = (mode: "dashboard" | "studio") => {
    setViewMode(mode);
    localStorage.setItem("pulse_view_mode", mode);
  };
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 960 : false
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("pulse_sidebar_collapsed") === "true";
  });

  useEffect(() => {
    const handleResize = () => {
      const small = window.innerWidth <= 960;
      setIsSmallScreen(small);
      if (!small) {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSidebar = () => {
    if (isSmallScreen) {
      setMobileSidebarOpen((prev) => !prev);
    } else {
      setSidebarCollapsed((prev) => {
        const next = !prev;
        localStorage.setItem("pulse_sidebar_collapsed", String(next));
        return next;
      });
    }
  };
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("pulse_theme");
    if (saved === "blue" || saved === "dark" || saved === "light") return saved;
    return "blue";
  });
  const [tabs, setTabs] = useState<TabState[]>(() => {
    const firstCol = data.collections[0];
    if (firstCol) {
      const allReqs = collectRequests(firstCol.children);
      if (allReqs[0]) {
        return [
          {
            id: uid("tab"),
            requestId: allReqs[0].id,
            collectionId: firstCol.id,
            name: allReqs[0].name,
            dirty: false,
            draft: requestToSnapshot(allReqs[0]),
          },
        ];
      }
    }
    return [blankTab()];
  });
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);
  const [responses, setResponses] = useState<Record<string, ProxyResponse | null>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [reqTab, setReqTab] = useState<ReqTab>("params");
  const [savedLabel, setSavedLabel] = useState<string | null>(null);
  const [runnerCol, setRunnerCol] = useState<Collection | null>(null);
  const [editingCollectionCol, setEditingCollectionCol] = useState<Collection | null>(null);
  const [collectionModalTab, setCollectionModalTab] = useState<CollectionTab>("scripts-pre");
  const [envOpen, setEnvOpen] = useState(false);
  const [editTargetEnvId, setEditTargetEnvId] = useState<string | null>(null);
  const [editTargetVarKey, setEditTargetVarKey] = useState<string | null>(null);
  const [curlOpen, setCurlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importDropdownOpen, setImportDropdownOpen] = useState(false);
  const [snippetOpen, setSnippetOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState<boolean>(() => {
    return localStorage.getItem("pulse_skip_welcome") !== "true";
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem("pulse_sidebar_width");
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 180 && parsed <= 700) return parsed;
    }
    return 270;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [fontSettings, setFontSettings] = useState<FontSettings>(() => {
    const savedSize = localStorage.getItem("pulse_font_size");
    const savedFamily = localStorage.getItem("pulse_font_family");
    const savedCodeSize = localStorage.getItem("pulse_code_font_size");
    const savedCodeFamily = localStorage.getItem("pulse_code_font_family");

    // Default: Crisp 12px UI typography and 12px JetBrains Mono code typography
    const defaultFamily = FONT_FAMILY_PRESETS[0].value;
    const defaultCodeFamily = CODE_FONT_PRESETS[0].value;
    const defaultSize = 12;

    const initialSize = savedSize && savedSize !== "13" ? parseInt(savedSize, 10) || defaultSize : defaultSize;
    const initialFamily =
      savedFamily && (savedFamily.includes("Plus Jakarta") || savedFamily.includes("Inter"))
        ? savedFamily
        : defaultFamily;
    const initialCodeFamily =
      savedCodeFamily && !savedCodeFamily.includes("Courier") && !savedCodeFamily.includes("Monaco")
        ? savedCodeFamily
        : defaultCodeFamily;

    return {
      fontSize: initialSize,
      fontFamily: initialFamily,
      codeFontSize: savedCodeSize ? parseInt(savedCodeSize, 10) || 12 : 12,
      codeFontFamily: initialCodeFamily,
    };
  });

  const handleUpdateFontSettings = (next: FontSettings) => {
    setFontSettings(next);
    localStorage.setItem("pulse_font_size", String(next.fontSize));
    localStorage.setItem("pulse_font_family", next.fontFamily);
    localStorage.setItem("pulse_code_font_size", String(next.codeFontSize));
    localStorage.setItem("pulse_code_font_family", next.codeFontFamily);
  };
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState<number>(() => {
    const saved = localStorage.getItem("pulse_console_height");
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 160 && parsed <= 600) return parsed;
    }
    return 260;
  });
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>(() => [
    {
      id: uid("clog"),
      timestamp: Date.now(),
      type: "info",
      title: "Pulse API Studio v1.0.0 Engine Ready",
    },
    {
      id: uid("clog"),
      timestamp: Date.now() + 5,
      type: "info",
      title: "Local API Proxy listening at http://127.0.0.1:3001",
    },
  ]);

  const addConsoleLog = (log: ConsoleLog) => {
    setConsoleLogs((prev) => [...prev.slice(-350), log]);
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const importDropdownRef = useRef<HTMLDivElement>(null);

  const startResizingSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);
  };

  const resetSidebarWidth = () => {
    setSidebarWidth(270);
    localStorage.setItem("pulse_sidebar_width", "270");
  };

  useEffect(() => {
    if (!isResizingSidebar) return;

    const handleMouseMove = (e: MouseEvent) => {
      const minW = 200;
      const maxW = Math.min(650, window.innerWidth * 0.55);
      const newWidth = Math.max(minW, Math.min(maxW, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      localStorage.setItem("pulse_sidebar_width", String(sidebarWidth));
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingSidebar, sidebarWidth]);

  // Panel layout mode ("response-bottom" or "response-right")
  const [panelLayout, setPanelLayout] = useState<PanelLayoutMode>(() => {
    const saved = localStorage.getItem("pulse_panel_layout");
    if (saved === "response-bottom" || saved === "response-right") return saved;
    return "response-bottom";
  });

  // Vertical resizer state for bottom panel in editor
  const [bottomHeight, setBottomHeight] = useState<number>(() => {
    const saved = localStorage.getItem("pulse_bottom_height");
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 100 && parsed <= 900) return parsed;
    }
    return 280;
  });
  const [isResizingBottom, setIsResizingBottom] = useState(false);

  // Horizontal resizer state for right sidebar panel
  const [rightWidth, setRightWidth] = useState<number>(() => {
    const saved = localStorage.getItem("pulse_right_width");
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 220 && parsed <= 900) return parsed;
    }
    return 340;
  });
  const [isResizingRight, setIsResizingRight] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const bottomHeightRef = useRef(bottomHeight);
  bottomHeightRef.current = bottomHeight;
  const rightWidthRef = useRef(rightWidth);
  rightWidthRef.current = rightWidth;

  const handleUpdatePanelLayout = (next: PanelLayoutMode) => {
    setPanelLayout(next);
    localStorage.setItem("pulse_panel_layout", next);
    flashImport(
      `Studio Layout: ${
        next === "response-bottom"
          ? "Standard (Response on Bottom)"
          : "Side-by-Side (Response on Right)"
      }`
    );
  };

  const handleResetPanelSizes = () => {
    setRightWidth(340);
    setBottomHeight(280);
    localStorage.removeItem("pulse_right_width");
    localStorage.removeItem("pulse_bottom_height");
    flashImport("Reset panel sizes to defaults");
  };

  const startResizingBottom = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingBottom(true);
  };

  useEffect(() => {
    if (!isResizingBottom) return;

    const handleMouseMove = (e: MouseEvent) => {
      const editorEl = editorRef.current;
      if (!editorEl) return;
      const rect = editorEl.getBoundingClientRect();
      const newH = rect.bottom - e.clientY;
      const minH = 100;
      const maxH = Math.max(140, rect.height - 100);
      const clamped = Math.max(minH, Math.min(maxH, newH));
      bottomHeightRef.current = clamped;
      setBottomHeight(clamped);
    };

    const handleMouseUp = () => {
      setIsResizingBottom(false);
      localStorage.setItem("pulse_bottom_height", String(bottomHeightRef.current));
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingBottom]);

  const startResizingRight = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingRight(true);
  };

  useEffect(() => {
    if (!isResizingRight) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newW = window.innerWidth - e.clientX;
      const minW = 220;
      const maxW = Math.min(950, window.innerWidth * 0.65);
      const clamped = Math.max(minW, Math.min(maxW, newW));
      rightWidthRef.current = clamped;
      setRightWidth(clamped);
    };

    const handleMouseUp = () => {
      setIsResizingRight(false);
      localStorage.setItem("pulse_right_width", String(rightWidthRef.current));
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingRight]);

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
    document.documentElement.style.setProperty("--app-font-size", `${fontSettings.fontSize}px`);
    document.documentElement.style.setProperty("--font", fontSettings.fontFamily);
    document.documentElement.style.setProperty("--app-code-font-size", `${fontSettings.codeFontSize}px`);
    document.documentElement.style.setProperty("--mono", fontSettings.codeFontFamily);
  }, [fontSettings]);

  useEffect(() => {
    if (!importDropdownOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (importDropdownRef.current && !importDropdownRef.current.contains(e.target as Node)) {
        setImportDropdownOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImportDropdownOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
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
    switchViewMode("studio");
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
      const handleEnvUpdate = (updatedVars: KeyValue[]) => {
        if (!activeEnv) return;
        patchData((prev) => ({
          ...prev,
          environments: prev.environments.map((e) =>
            e.id === activeEnv.id ? { ...e, variables: updatedVars } : e
          ),
        }));
      };

      const handleColUpdate = (updatedVars: KeyValue[]) => {
        if (!activeCol) return;
        patchData((prev) => ({
          ...prev,
          collections: prev.collections.map((c) =>
            c.id === activeCol.id ? { ...c, variables: updatedVars } : c
          ),
        }));
      };

      const resp = await sendRequest(
        activeTab.draft,
        activeEnv,
        activeCol,
        handleEnvUpdate,
        {
          requestId: activeTab.requestId,
          onCollectionUpdate: handleColUpdate,
        }
      );
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

      // Log request & response telemetry to console with fully resolved values
      const outbound = resp.outbound || buildOutbound(activeTab.draft, activeEnv, activeCol);
      addConsoleLog({
        id: uid("clog"),
        timestamp: Date.now(),
        type: resp.ok ? "network" : "error",
        title: `${activeTab.draft.method} ${outbound.url || "request"}`,
        method: activeTab.draft.method,
        url: outbound.url,
        status: resp.status,
        statusText: resp.statusText,
        time: resp.time,
        size: resp.size,
        requestHeaders: outbound.headers,
        requestBody: outbound.body ?? undefined,
        responseHeaders: resp.headers,
        responseBody: resp.body,
        curl: toCurl(activeTab.draft, activeEnv, activeCol),
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setResponses((r) => ({
        ...r,
        [tabId]: {
          ok: false,
          error: true,
          status: 0,
          statusText: "Error",
          headers: {},
          body: errMsg,
          time: 0,
          size: 0,
        },
      }));
      addConsoleLog({
        id: uid("clog"),
        timestamp: Date.now(),
        type: "error",
        title: `Failed: ${activeTab.draft.method} ${activeTab.draft.url || "request"}`,
        method: activeTab.draft.method,
        url: activeTab.draft.url,
        status: 0,
        statusText: "Error",
        responseBody: errMsg,
      });
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
    let createdCol: Collection | null = null;
    if (!colId) {
      createdCol = { id: uid("col"), name: "Default Collection", description: "", children: [] };
      colId = createdCol.id;
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
    patchData((prev) => {
      const base = createdCol ? [...prev.collections, createdCol] : prev.collections;
      return {
        ...prev,
        collections: insertNode(base, colId!, null, req),
      };
    });
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
    switchViewMode("studio");
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

  const deleteEnvironment = (id: string) => {
    const env = data.environments.find((e) => e.id === id);
    if (!env) return;
    if (!window.confirm(`Delete environment "${env.name}"?`)) return;
    const next = data.environments.filter((e) => e.id !== id);
    patchData((prev) => ({
      ...prev,
      environments: next,
      activeEnvId: prev.activeEnvId === id ? (next[0]?.id ?? null) : prev.activeEnvId,
    }));
    flashImport(`Deleted environment "${env.name}"`);
  };

  const duplicateEnv = (id: string) => {
    const env = data.environments.find((e) => e.id === id);
    if (!env) return;
    const dup = duplicateEnvironment(env);
    const idx = data.environments.findIndex((e) => e.id === id);
    const next = [...data.environments];
    next.splice(idx + 1, 0, dup);
    patchData({
      environments: next,
      activeEnvId: dup.id,
    });
    flashImport(`Duplicated environment "${env.name}"`);
  };

  const updateEnvVariable = (varKey: string, newValue: string, targetEnvId?: string | null) => {
    const envId = targetEnvId ?? data.activeEnvId;
    if (!envId) {
      if (data.environments.length > 0) {
        const first = data.environments[0];
        const next = data.environments.map((e) => {
          if (e.id === first.id) {
            const hasVar = e.variables.some((v) => v.key === varKey);
            const nextVars = hasVar
              ? e.variables.map((v) => (v.key === varKey ? { ...v, value: newValue, enabled: true } : v))
              : [...e.variables, kv(varKey, newValue)];
            return { ...e, variables: nextVars };
          }
          return e;
        });
        patchData({ environments: next, activeEnvId: first.id });
        flashImport(`Set ${varKey} in "${first.name}"`);
      } else {
        const newEnv: Environment = {
          id: uid("env"),
          name: "Development",
          variables: [kv(varKey, newValue)],
        };
        patchData({ environments: [newEnv], activeEnvId: newEnv.id });
        flashImport(`Created "Development" environment with ${varKey}`);
      }
      return;
    }

    const next = data.environments.map((e) => {
      if (e.id === envId) {
        const hasVar = e.variables.some((v) => v.key === varKey);
        const nextVars = hasVar
          ? e.variables.map((v) => (v.key === varKey ? { ...v, value: newValue, enabled: true } : v))
          : [...e.variables, kv(varKey, newValue)];
        return { ...e, variables: nextVars };
      }
      return e;
    });
    const targetEnv = data.environments.find((e) => e.id === envId);
    patchData({ environments: next });
    flashImport(`Updated ${varKey} in "${targetEnv?.name || 'Environment'}"`);
  };

  const newRequest = (collectionId: string, folderId: string | null) => {
    let targetColId = collectionId;
    let createdCol: Collection | null = null;
    if (!targetColId || !data.collections.some((c) => c.id === targetColId)) {
      if (data.collections.length === 0) {
        createdCol = { id: uid("col"), name: "Default Collection", description: "", children: [] };
        targetColId = createdCol.id;
      } else {
        targetColId = data.collections[0].id;
      }
    }

    const req: RequestItem = snapshotToRequest(uid("req"), emptySnapshot({ name: "New Request" }));
    patchData((prev) => {
      const base = createdCol ? [...prev.collections, createdCol] : prev.collections;
      return {
        ...prev,
        collections: insertNode(base, targetColId, folderId, req),
      };
    });
    const tab: TabState = {
      id: uid("tab"),
      requestId: req.id,
      collectionId: targetColId,
      name: req.name,
      dirty: false,
      draft: requestToSnapshot(req),
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const newFolder = (collectionId: string, folderId: string | null = null) => {
    let targetColId = collectionId;
    let createdCol: Collection | null = null;
    if (!targetColId || !data.collections.some((c) => c.id === targetColId)) {
      if (data.collections.length === 0) {
        createdCol = { id: uid("col"), name: "Default Collection", description: "", children: [] };
        targetColId = createdCol.id;
      } else {
        targetColId = data.collections[0].id;
      }
    }

    const name = window.prompt("Folder name", "New Folder");
    if (!name || !name.trim()) return;
    const folder: TreeNode = { id: uid("fld"), type: "folder", name: name.trim(), children: [] };
    patchData((prev) => {
      const base = createdCol ? [...prev.collections, createdCol] : prev.collections;
      return {
        ...prev,
        collections: insertNode(base, targetColId, folderId, folder),
      };
    });
    flashImport(`Created folder "${name.trim()}"`);
  };

  const openEditCollection = (
    id: string,
    initialTab: CollectionTab = "scripts-pre"
  ) => {
    const col = data.collections.find((c) => c.id === id);
    if (!col) return;
    setEditingCollectionCol(col);
    setCollectionModalTab(initialTab);
  };

  const saveCollection = (updated: Collection) => {
    patchData((prev) => ({
      ...prev,
      collections: prev.collections.map((c) => (c.id === updated.id ? updated : c)),
    }));
    flashImport(`Saved collection "${updated.name}"`);
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

  const duplicateCol = (id: string) => {
    const col = data.collections.find((c) => c.id === id);
    if (!col) return;
    const dup = duplicateCollection(col);
    const idx = data.collections.findIndex((c) => c.id === id);
    const next = [...data.collections];
    next.splice(idx + 1, 0, dup);
    patchData({ collections: next });
    flashImport(`Duplicated collection "${col.name}"`);
  };

  const duplicateTreeNode = (nodeId: string, collectionId: string) => {
    const col = data.collections.find((c) => c.id === collectionId);
    if (!col) return;
    const parentId = parentFolderId(col.children, nodeId);
    const findItem = (nodes: TreeNode[]): TreeNode | null => {
      for (const n of nodes) {
        if (n.id === nodeId) return n;
        if (n.type === "folder") {
          const f = findItem(n.children);
          if (f) return f;
        }
      }
      return null;
    };
    const target = findItem(col.children);
    if (!target) return;
    const duplicated = duplicateNode(target);
    patchData((prev) => ({
      ...prev,
      collections: insertNode(prev.collections, collectionId, parentId ?? null, duplicated),
    }));
    flashImport(`Duplicated ${target.type} "${target.name}"`);
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

  const importCurl = (snap: RequestSnapshot, target: CurlImportTarget) => {
    let targetColId: string | null = null;
    let createdCol: Collection | null = null;

    if (target.mode === "existing") {
      targetColId = target.collectionId || data.collections[0]?.id || null;
      if (!targetColId) {
        createdCol = {
          id: uid("col"),
          name: "My Collection",
          description: "",
          children: [],
        };
        targetColId = createdCol.id;
      }
    } else if (target.mode === "new") {
      const colName = target.newCollectionName?.trim() || "cURL Collection";
      createdCol = {
        id: uid("col"),
        name: colName,
        description: "",
        children: [],
      };
      targetColId = createdCol.id;
    }

    if (targetColId && target.mode !== "scratch") {
      const req: RequestItem = snapshotToRequest(uid("req"), snap);
      patchData((prev) => {
        const base = createdCol ? [...prev.collections, createdCol] : prev.collections;
        return {
          ...prev,
          collections: insertNode(base, targetColId!, target.folderId ?? null, req),
        };
      });

      const tab: TabState = {
        id: uid("tab"),
        requestId: req.id,
        collectionId: targetColId,
        name: req.name,
        dirty: false,
        draft: snap,
      };

      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
      switchViewMode("studio");
      setCurlOpen(false);

      const colName = createdCol
        ? createdCol.name
        : data.collections.find((c) => c.id === targetColId)?.name || "Collection";
      flashImport(`Saved cURL request "${req.name}" to "${colName}"`);
    } else {
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
      switchViewMode("studio");
      setCurlOpen(false);
      flashImport(`Opened cURL request "${snap.name}" in scratchpad`);
    }
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

  const renderSnippet = (isDrawer = false) => (
    <div className="snippet-container">
      <div className="snippet-head">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13 }}>📜</span>
          <span>Code snippet</span>
          {isDrawer && (
            <span
              style={{
                fontSize: "10px",
                color: "var(--accent)",
                background: "var(--accent-soft)",
                padding: "1px 6px",
                borderRadius: 4,
                fontWeight: 600,
              }}
            >
              Bottom Drawer
            </span>
          )}
        </div>
        <select defaultValue="curl" className="snippet-lang">
          <option value="curl">cURL</option>
        </select>
        <button className="btn sm ghost" onClick={() => void copyCurl()}>
          {copied ? "Copied" : "Copy"}
        </button>
        {isDrawer && (
          <button
            className="btn sm ghost"
            onClick={() => setSnippetOpen(false)}
            title="Close snippet drawer"
            style={{ padding: "2px 6px" }}
          >
            ✕
          </button>
        )}
      </div>
      <pre className="snippet-body">{snippet}</pre>
    </div>
  );

  const effectivePanelLayout = isSmallScreen ? "response-bottom" : panelLayout;
  const isRightPanelOpen =
    viewMode === "studio" && !isSmallScreen && (effectivePanelLayout === "response-right" || snippetOpen);

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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const loadSampleTestSuite = () => {
    const sampleCols = createSampleCollections();
    const sampleEnvs = createSampleEnvironments();
    patchData((prev) => {
      const existingColNames = new Set(prev.collections.map((c) => c.name.toLowerCase()));
      const newCols = sampleCols.filter((c) => !existingColNames.has(c.name.toLowerCase()));

      const existingEnvNames = new Set(prev.environments.map((e) => e.name.toLowerCase()));
      const newEnvs = sampleEnvs.filter((e) => !existingEnvNames.has(e.name.toLowerCase()));

      const updatedEnvs = [...prev.environments, ...newEnvs];
      return {
        ...prev,
        collections: [...prev.collections, ...newCols],
        environments: updatedEnvs,
        activeEnvId: prev.activeEnvId || updatedEnvs[0]?.id || null,
      };
    });
    flashImport("Loaded sample test collections & environments!");
  };

  useEffect(() => {
    if (data.collections.length === 0 && data.environments.length === 0) {
      loadSampleTestSuite();
    }
  }, []);

  return (
    <div
      className="app"
      style={{ "--console-height": consoleOpen ? `${consoleHeight}px` : "0px" } as React.CSSProperties}
    >
      <header className="topbar">
        <button
          className={`sidebar-toggle-btn ${mobileSidebarOpen || (!isSmallScreen && !sidebarCollapsed) ? "active" : ""}`}
          onClick={toggleSidebar}
          title={
            isSmallScreen
              ? "Toggle Navigation Drawer"
              : `Toggle Sidebar (${typeof navigator !== "undefined" && navigator.platform?.includes("Mac") ? "⌘B" : "Ctrl+B"})`
          }
          aria-label="Toggle Sidebar"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>

        <div className="brand" onClick={() => switchViewMode("studio")} style={{ cursor: "pointer" }}>
          <img src="./logo.png" alt="Pulse API Studio" className="brand-logo-img" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: "-0.01em" }}>Pulse API Studio</span>
            <span style={{ fontSize: 10, color: "var(--text-mute)", fontWeight: 500 }}>API Engine</span>
          </div>
        </div>

        <div className="view-mode-tabs">
          <button
            className={`view-tab ${viewMode === "studio" ? "active" : ""}`}
            onClick={() => switchViewMode("studio")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span className="view-tab-text">Studio ({tabs.length})</span>
          </button>
          <button
            className={`view-tab ${viewMode === "dashboard" ? "active" : ""}`}
            onClick={() => switchViewMode("dashboard")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
            <span className="view-tab-text">Dashboard</span>
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
          <button
            className="top-env-eye-btn"
            title={activeEnv ? `Quick Look: ${activeEnv.name} (${activeEnv.variables.length} variables)` : "Quick Look & Manage Environments"}
            onClick={() => {
              if (activeEnv) setEditTargetEnvId(activeEnv.id);
              setEnvOpen(true);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          {activeEnv && (
            <>
              {(() => {
                const bVal = activeEnv.variables.find((v) => v.key === "baseUrl" && v.enabled !== false)?.value;
                return (
                  <button
                    type="button"
                    className="top-env-baseurl-chip"
                    title={`Active baseUrl: ${bVal || "not set"}. Click to edit.`}
                    onClick={() => {
                      setEditTargetEnvId(activeEnv.id);
                      setEditTargetVarKey("baseUrl");
                      setEnvOpen(true);
                    }}
                  >
                    <span className="baseurl-tag">baseUrl:</span>
                    <span className="baseurl-text">{bVal || '""'}</span>
                    <span className="baseurl-pencil">✏️</span>
                  </button>
                );
              })()}
              <button
                className="top-env-action-btn"
                title={`Edit environment "${activeEnv.name}"`}
                onClick={() => {
                  setEditTargetEnvId(activeEnv.id);
                  setEnvOpen(true);
                }}
                aria-label={`Edit ${activeEnv.name}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
              </button>
              <button
                className="top-env-action-btn danger-hover"
                title={`Delete environment "${activeEnv.name}"`}
                onClick={() => deleteEnvironment(activeEnv.id)}
                aria-label={`Delete ${activeEnv.name}`}
              >
                ✕
              </button>
            </>
          )}
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

          {/* Quick Theme Toggle (Click cycles themes, or open full Theme tab in Settings) */}
          <button
            className="top-theme-quick-btn"
            title={`Current theme: ${theme === "light" ? "Light" : theme === "dark" ? "Dark" : "Midnight Blue"}. Click to cycle themes, or customize in Settings.`}
            onClick={() => {
              const nextTheme: ThemeMode = theme === "light" ? "dark" : theme === "dark" ? "blue" : "light";
              setTheme(nextTheme);
              localStorage.setItem("pulse_theme", nextTheme);
            }}
            aria-label="Quick Toggle Theme"
          >
            {theme === "light" ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            ) : theme === "dark" ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="m4.93 4.93 4.24 4.24" />
                <path d="m14.83 9.17 4.24-4.24" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            )}
          </button>

          {/* Settings Button: Preferences, Themes, Typography & Layout */}
          <button
            className="top-settings-btn"
            onClick={() => setSettingsOpen(true)}
            title="Preferences & Settings (Themes, Fonts, Workspace Layout)"
            aria-label="Preferences & Settings"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
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
          {viewMode === "studio" && !isSmallScreen && (
            <>
              <button
                className="btn ghost sm top-panel-layout-btn"
                onClick={() =>
                  handleUpdatePanelLayout(
                    panelLayout === "response-bottom" ? "response-right" : "response-bottom"
                  )
                }
                title={`Studio Workspace Layout: ${
                  panelLayout === "response-bottom"
                    ? "Response on Bottom (Click to switch to Side-by-Side)"
                    : "Response on Right (Click to switch to Response on Bottom)"
                }`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 10px",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                <span>{panelLayout === "response-bottom" ? "◫" : "▥"}</span>
                <span className="top-btn-label">{panelLayout === "response-bottom" ? "Bottom" : "Side-by-Side"}</span>
              </button>
              <button className="btn ghost sm top-code-btn" onClick={() => setSnippetOpen((v) => !v)}>
                <span className="top-btn-label">{snippetOpen ? "Hide code" : "Code"}</span>
              </button>
            </>
          )}

          {/* Apple iOS Welcome Tour Button */}
          <button
            className="btn ghost sm top-welcome-btn"
            onClick={() => setWelcomeOpen(true)}
            title="Play Apple iOS Welcome Animation"
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", fontSize: "11px", fontWeight: 600 }}
          >
            <span>✨</span>
            <span className="top-btn-label">Welcome</span>
          </button>

          {/* Download Desktop App button hidden for now
          <button
            type="button"
            className="top-download-btn"
            title="Download Pulse Desktop App for macOS (.dmg, .zip) or Windows (.zip, .exe)"
            aria-label="Download Desktop App"
            onClick={() => setDownloadOpen(true)}
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
            <span className="top-download-badge">App</span>
          </button>
          */}
        </div>
      </header>
      <div
        className={`layout ${isRightPanelOpen ? "with-snippet" : ""} ${
          sidebarCollapsed && !isSmallScreen ? "sidebar-collapsed" : ""
        } ${isResizingSidebar ? "is-resizing" : ""} ${
          isResizingRight ? "is-resizing-h" : ""
        } ${isResizingBottom ? "is-resizing-v" : ""}`}
        style={{
          "--sidebar": `${sidebarWidth}px`,
          "--right-panel": `${rightWidth}px`,
        } as React.CSSProperties}
      >
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
            switchViewMode("dashboard");
            setMobileSidebarOpen(false);
          }}
          collections={data.collections}
          environments={data.environments}
          activeEnvId={data.activeEnvId}
          activeRequestId={activeTab?.requestId ?? null}
          isResizing={isResizingSidebar}
          onStartResize={startResizingSidebar}
          onResetResize={resetSidebarWidth}
          onOpenRequest={(cId, rId) => {
            openRequest(cId, rId);
            setMobileSidebarOpen(false);
          }}
          onNewCollection={newCollection}
          onNewRequest={newRequest}
          onNewRequestType={createNewRequest}
          onNewFolder={newFolder}
          onEditCollection={openEditCollection}
          onRenameCollection={renameCollection}
          onDeleteCollection={deleteCollection}
          onExportCollection={exportCol}
          onDuplicateCollection={duplicateCol}
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
          onDuplicateNode={duplicateTreeNode}
          onImportClick={() => setImportOpen(true)}
          onImportCurl={() => setCurlOpen(true)}
          onSelectEnv={(id) => patchData({ activeEnvId: id })}
          onManageEnv={() => {
            setEditTargetEnvId(null);
            setEnvOpen(true);
          }}
          onNewEnv={createNewEnvironment}
          onEditEnv={(id) => {
            setEditTargetEnvId(id);
            setEnvOpen(true);
          }}
          onDuplicateEnv={duplicateEnv}
          onDeleteEnv={deleteEnvironment}
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
              switchViewMode("studio");
            }}
            onImportClick={() => setImportOpen(true)}
            onManageEnv={() => setEnvOpen(true)}
            onClearHistory={() => patchData({ history: [] })}
            onSwitchToStudio={() => switchViewMode("studio")}
            onLoadSamples={loadSampleTestSuite}
            onOpenDownload={() => setDownloadOpen(true)}
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
                <div className="editor" ref={editorRef}>
                  <div className="editor-top-area">
                    <RequestPane
                      draft={activeTab.draft}
                      sending={Boolean(sending[activeTab.id])}
                      reqTab={reqTab}
                      onReqTab={setReqTab}
                      onChange={onDraftChange}
                      onSend={() => void sendActive()}
                      envName={activeEnv?.name ?? null}
                      env={activeEnv}
                      environments={data.environments}
                      onSelectEnv={(id) => patchData({ activeEnvId: id })}
                      onUpdateEnvVariable={updateEnvVariable}
                      onManageEnv={(id, targetVarKey) => {
                        setEditTargetEnvId(id ?? activeEnv?.id ?? null);
                        setEditTargetVarKey(targetVarKey ?? null);
                        setEnvOpen(true);
                      }}
                      collection={activeCol}
                      onEditCollection={openEditCollection}
                    />
                  </div>

                  {/* Bottom area: Either ResponsePane (if response-bottom) OR Snippet drawer (if response-right and snippetOpen) */}
                  {(effectivePanelLayout === "response-bottom" || snippetOpen) && (
                    <div
                      className={`editor-bottom-area ${
                        effectivePanelLayout === "response-right" ? "snippet-drawer-area" : ""
                      }`}
                      style={{ height: `${bottomHeight}px` }}
                    >
                      <div
                        className={`panel-resizer-v ${isResizingBottom ? "active" : ""}`}
                        onMouseDown={startResizingBottom}
                        title="Drag up or down to resize bottom panel"
                      />
                      {effectivePanelLayout === "response-bottom" ? (
                        <ResponsePane
                          response={responses[activeTab.id] ?? null}
                          sending={Boolean(sending[activeTab.id])}
                        />
                      ) : (
                        renderSnippet(true)
                      )}
                    </div>
                  )}
                </div>
              )}
            </main>

            {/* Right sidebar column: Snippet (if response-bottom and snippetOpen) OR ResponsePane (if response-right) */}
            {!isSmallScreen && effectivePanelLayout === "response-bottom" && snippetOpen && (
              <aside className="right-sidebar-panel snippet">
                <div
                  className={`panel-resizer-h ${isResizingRight ? "active" : ""}`}
                  onMouseDown={startResizingRight}
                  title="Drag left or right to resize code snippet panel"
                />
                {renderSnippet(false)}
              </aside>
            )}

            {!isSmallScreen && effectivePanelLayout === "response-right" && (
              <aside className="right-sidebar-panel">
                <div
                  className={`panel-resizer-h ${isResizingRight ? "active" : ""}`}
                  onMouseDown={startResizingRight}
                  title="Drag left or right to resize response panel"
                />
                <ResponsePane
                  response={responses[activeTab.id] ?? null}
                  sending={Boolean(sending[activeTab.id])}
                />
              </aside>
            )}
          </>
        )}
      </div>
      <ConsoleDrawer
        isOpen={consoleOpen}
        onClose={() => setConsoleOpen(false)}
        logs={consoleLogs}
        onClear={() => setConsoleLogs([])}
        environments={data.environments}
        activeEnv={activeEnv}
        collections={data.collections}
        height={consoleHeight}
        onHeightChange={(h) => {
          setConsoleHeight(h);
          localStorage.setItem("pulse_console_height", String(h));
        }}
        onLoadSamples={loadSampleTestSuite}
      />
      <Footer
        activeEnvName={activeEnv?.name ?? null}
        collectionsCount={data.collections.length}
        requestsCount={totalRequests}
        viewMode={viewMode}
        onSwitchView={switchViewMode}
        consoleOpen={consoleOpen}
        onToggleConsole={() => setConsoleOpen((v) => !v)}
        consoleLogsCount={consoleLogs.length}
        consoleErrorCount={consoleLogs.filter((l) => l.type === "error" || (l.status && l.status >= 400)).length}
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
      {editingCollectionCol && (
        <CollectionModal
          collection={editingCollectionCol}
          isOpen={Boolean(editingCollectionCol)}
          initialTab={collectionModalTab}
          onClose={() => setEditingCollectionCol(null)}
          onSave={saveCollection}
          onDuplicate={duplicateCol}
        />
      )}
      {envOpen && (
        <EnvModal
          environments={data.environments}
          activeEnvId={data.activeEnvId}
          targetEnvId={editTargetEnvId}
          targetVarKey={editTargetVarKey}
          onChange={(environments) => patchData({ environments })}
          onActive={(activeEnvId) => patchData({ activeEnvId })}
          onImportEnv={(file) => void importFile(file, true)}
          onClose={() => {
            setEnvOpen(false);
            setEditTargetEnvId(null);
            setEditTargetVarKey(null);
          }}
        />
      )}
      {curlOpen && (
        <CurlModal
          collections={data.collections}
          onImport={importCurl}
          onClose={() => setCurlOpen(false)}
        />
      )}
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
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={fontSettings}
        onUpdateSettings={handleUpdateFontSettings}
        theme={theme}
        onUpdateTheme={(t) => {
          setTheme(t);
          localStorage.setItem("pulse_theme", t);
        }}
        panelLayout={panelLayout}
        onUpdatePanelLayout={handleUpdatePanelLayout}
        onResetPanelSizes={handleResetPanelSizes}
      />
      <AppleWelcomeModal isOpen={welcomeOpen} onClose={() => setWelcomeOpen(false)} />
      <DownloadModal
        isOpen={downloadOpen}
        onClose={() => setDownloadOpen(false)}
        onDownloadStarted={(os, format) => {
          flashImport(`Starting download for ${os === "mac" ? "macOS" : "Windows"} (${format.toUpperCase()})...`);
        }}
      />
    </div>
  );
}
