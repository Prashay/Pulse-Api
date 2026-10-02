import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Collection, Environment, TreeNode } from "../types";
import { METHOD_COLORS } from "../types";

interface Props {
  viewMode?: "dashboard" | "studio";
  onSelectDashboard?: () => void;
  collections: Collection[];
  environments: Environment[];
  activeEnvId: string | null;
  activeRequestId: string | null;
  onOpenRequest: (collectionId: string, requestId: string) => void;
  onNewCollection: () => void;
  onNewRequest: (collectionId: string, folderId: string | null) => void;
  onNewRequestType?: (type: "http" | "websocket" | "graphql" | "mock") => void;
  onNewFolder: (collectionId: string, folderId: string | null) => void;
  onEditCollection?: (id: string, initialTab?: "scripts-pre" | "scripts-post" | "variables" | "overview") => void;
  onRenameCollection: (id: string) => void;
  onDeleteCollection: (id: string) => void;
  onExportCollection: (id: string) => void;
  onDuplicateCollection?: (id: string) => void;
  onRunCollection: (id: string) => void;
  onRenameNode: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onDuplicateNode?: (id: string, collectionId: string) => void;
  onImportClick: () => void;
  onImportCurl: () => void;
  onSelectEnv: (id: string) => void;
  onManageEnv: () => void;
  onNewEnv: () => void;
  onEditEnv?: (id: string) => void;
  onDuplicateEnv?: (id: string) => void;
  onDeleteEnv?: (id: string) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  isResizing?: boolean;
  onStartResize?: (e: React.MouseEvent) => void;
  onResetResize?: () => void;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.14s cubic-bezier(0.16, 1, 0.3, 1)",
        display: "inline-block",
        flexShrink: 0,
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function Sidebar(props: Props) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [colOpen, setColOpen] = useState(true);
  const [envOpen, setEnvOpen] = useState(true);
  const [colSortOrder, setColSortOrder] = useState<"default" | "asc" | "desc">(() => {
    const saved = localStorage.getItem("pulse_col_sort");
    if (saved === "asc" || saved === "desc" || saved === "default") return saved;
    return "default";
  });
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const toggleAllFolders = () => {
    const allFolderIds: string[] = [];
    const collectFolderIds = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.type === "folder") {
          allFolderIds.push(node.id);
          collectFolderIds(node.children);
        }
      }
    };
    props.collections.forEach((c) => collectFolderIds(c.children));

    const hasAnyClosed = allFolderIds.some((id) => (collapsed[id] ?? true));
    const next: Record<string, boolean> = { ...collapsed };
    for (const id of allFolderIds) {
      next[id] = !hasAnyClosed;
    }
    setCollapsed(next);
  };

  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [plusFilter, setPlusFilter] = useState("");
  const plusWrapperRef = useRef<HTMLDivElement>(null);
  const plusSearchInputRef = useRef<HTMLInputElement>(null);

  const handleAddFolderPrompt = () => {
    if (props.collections.length === 0) {
      props.onNewFolder("", null);
      return;
    }
    if (props.collections.length === 1) {
      props.onNewFolder(props.collections[0].id, null);
      return;
    }
    const colList = props.collections.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
    const choice = window.prompt(
      `Add folder to which collection?\n${colList}\n\nEnter number (1-${props.collections.length}):`,
      "1"
    );
    if (!choice) return;
    const idx = parseInt(choice, 10) - 1;
    const targetCol = props.collections[idx] || props.collections[0];
    props.onNewFolder(targetCol.id, null);
  };

  useEffect(() => {
    if (!plusMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (plusWrapperRef.current && !plusWrapperRef.current.contains(e.target as Node)) {
        setPlusMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlusMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [plusMenuOpen]);

  const menuItems = useMemo(
    () => [
      {
        id: "http",
        category: "requests" as const,
        title: "HTTP Request",
        desc: "REST, CRUD & API endpoint testing",
        icon: "🌐",
        badge: "HTTP",
        badgeClass: "badge-http",
        action: () => {
          setPlusMenuOpen(false);
          props.onNewRequestType ? props.onNewRequestType("http") : props.onNewRequest(props.collections[0]?.id || "", null);
        },
      },
      {
        id: "websocket",
        category: "requests" as const,
        title: "WebSocket",
        desc: "Real-time duplex wss:// stream",
        icon: "🔌",
        badge: "WS",
        badgeClass: "badge-ws",
        action: () => {
          setPlusMenuOpen(false);
          props.onNewRequestType ? props.onNewRequestType("websocket") : props.onNewRequest(props.collections[0]?.id || "", null);
        },
      },
      {
        id: "graphql",
        category: "requests" as const,
        title: "GraphQL",
        desc: "GraphQL query & mutation request",
        icon: "⚛️",
        badge: "GQL",
        badgeClass: "badge-gql",
        action: () => {
          setPlusMenuOpen(false);
          props.onNewRequestType ? props.onNewRequestType("graphql") : props.onNewRequest(props.collections[0]?.id || "", null);
        },
      },
      {
        id: "mock",
        category: "requests" as const,
        title: "Local Mock Test",
        desc: "Testbed endpoint against local engine",
        icon: "⚡",
        badge: "MOCK",
        badgeClass: "badge-mock",
        action: () => {
          setPlusMenuOpen(false);
          props.onNewRequestType ? props.onNewRequestType("mock") : props.onNewRequest(props.collections[0]?.id || "", null);
        },
      },
      {
        id: "collection",
        category: "organize" as const,
        title: "Collection",
        desc: "Group requests into a runnable test suite",
        icon: "📁",
        action: () => {
          setPlusMenuOpen(false);
          props.onNewCollection();
        },
      },
      {
        id: "folder",
        category: "organize" as const,
        title: "Collection Folder",
        desc: "Organize endpoints into categorized subfolders",
        icon: "📂",
        badge: "FOLDER",
        badgeClass: "badge-folder",
        action: () => {
          setPlusMenuOpen(false);
          handleAddFolderPrompt();
        },
      },
      {
        id: "environment",
        category: "organize" as const,
        title: "Environment",
        desc: "Configure base URLs & secret variables",
        icon: "🌐",
        action: () => {
          setPlusMenuOpen(false);
          props.onNewEnv();
        },
      },
      {
        id: "curl",
        category: "tools" as const,
        title: "Import cURL",
        desc: "Paste raw cURL command into studio",
        icon: "📋",
        action: () => {
          setPlusMenuOpen(false);
          props.onImportCurl();
        },
      },
      {
        id: "import",
        category: "tools" as const,
        title: "Import File or Folder",
        desc: "Postman Collections & Environments",
        icon: "📄",
        action: () => {
          setPlusMenuOpen(false);
          props.onImportClick();
        },
      },
    ],
    [props]
  );

  const filteredMenuItems = useMemo(() => {
    const f = plusFilter.trim().toLowerCase();
    if (!f) return menuItems;
    return menuItems.filter(
      (item) =>
        item.title.toLowerCase().includes(f) ||
        item.desc.toLowerCase().includes(f) ||
        (item.badge && item.badge.toLowerCase().includes(f))
    );
  }, [plusFilter, menuItems]);

  const hasCategoryItems = (cat: "requests" | "organize" | "tools") =>
    filteredMenuItems.some((i) => i.category === cat);

  const renderPlusCategory = (title: string, cat: "requests" | "organize" | "tools") => {
    const items = filteredMenuItems.filter((i) => i.category === cat);
    if (items.length === 0) return null;
    return (
      <div key={cat} className="plus-menu-section">
        <div className="plus-menu-section-label">{title}</div>
        {items.map((item) => (
          <div key={item.id} className="plus-menu-item" onClick={item.action}>
            <span className="plus-item-icon">{item.icon}</span>
            <div className="plus-item-text">
              <span className="plus-item-title">{item.title}</span>
              <span className="plus-item-desc">{item.desc}</span>
            </div>
            {item.badge && (
              <span className={`plus-item-badge ${item.badgeClass || ""}`}>{item.badge}</span>
            )}
          </div>
        ))}
      </div>
    );
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = props.collections;
    if (q) {
      base = base
        .map((col) => ({
          ...col,
          children: filterNodes(col.children, q),
        }))
        .filter((col) => col.name.toLowerCase().includes(q) || col.children.length > 0);
    }
    if (colSortOrder === "asc") {
      return [...base].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    }
    if (colSortOrder === "desc") {
      return [...base].sort((a, b) => b.name.localeCompare(a.name, undefined, { sensitivity: "base" }));
    }
    return base;
  }, [props.collections, query, colSortOrder]);

  return (
    <aside className={`sidebar ${props.mobileOpen ? "mobile-open" : ""}`} onClick={() => setMenu(null)}>
      {props.onCloseMobile && (
        <div className="mobile-sidebar-header">
          <div className="mobile-sidebar-title">
            <img src="./logo.png" alt="Logo" style={{ width: 18, height: 18, borderRadius: 4 }} />
            <span>Pulse Collections</span>
          </div>
          <button
            className="mobile-sidebar-close"
            onClick={(e) => {
              e.stopPropagation();
              props.onCloseMobile?.();
            }}
            aria-label="Close Sidebar"
          >
            ✕
          </button>
        </div>
      )}
      <div className="side-toolbar">
        <input
          className="search"
          placeholder="Search..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="plus-btn-wrapper" ref={plusWrapperRef}>
          <button
            className={`toolbar-icon-btn plus-btn ${plusMenuOpen ? "active" : ""}`}
            title="Create new request, collection, environment..."
            onClick={(e) => {
              e.stopPropagation();
              setPlusMenuOpen((v) => !v);
              setPlusFilter("");
            }}
            aria-label="Create new"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {plusMenuOpen && (
            <div className="plus-dropdown" onClick={(e) => e.stopPropagation()}>
              <div className="plus-search-box">
                <span className="plus-search-icon">🔍</span>
                <input
                  ref={plusSearchInputRef}
                  className="plus-search-input"
                  placeholder="Search..."
                  value={plusFilter}
                  onChange={(e) => setPlusFilter(e.target.value)}
                  autoFocus
                />
                {plusFilter && (
                  <button className="plus-search-clear" onClick={() => setPlusFilter("")}>
                    ✕
                  </button>
                )}
              </div>

              <div className="plus-menu-scroll">
                {renderPlusCategory("REQUESTS & PROTOCOLS", "requests")}
                {hasCategoryItems("organize") && <div className="plus-menu-divider" />}
                {renderPlusCategory("ORGANIZATION & ENVIRONMENTS", "organize")}
                {hasCategoryItems("tools") && <div className="plus-menu-divider" />}
                {renderPlusCategory("IMPORT & TOOLS", "tools")}

                {filteredMenuItems.length === 0 && (
                  <div className="plus-empty">No results for "{plusFilter}"</div>
                )}
              </div>
            </div>
          )}
        </div>
        <button
          className="toolbar-icon-btn"
          title="Import collection or environment JSON"
          onClick={props.onImportClick}
          aria-label="Import"
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
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            <polyline points="7 11 12 16 17 11" />
            <line x1="12" y1="4" x2="12" y2="16" />
          </svg>
        </button>
        <button className="toolbar-icon-btn curl-btn" title="Import cURL" onClick={props.onImportCurl}>
          cURL
        </button>
      </div>

      <div className="side-body">
        {props.onSelectDashboard && (
          <div
            className={`env-row ${props.viewMode === "dashboard" ? "active" : ""}`}
            style={{
              margin: "2px 0 10px",
              fontWeight: 700,
              fontSize: 12,
              color: props.viewMode === "dashboard" ? "#fff" : "var(--text-dim)",
              background: props.viewMode === "dashboard" ? "var(--bg-active)" : undefined,
            }}
            onClick={props.onSelectDashboard}
          >
            <span
              className="env-dot"
              style={{ background: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", fontWeight: 800 }}
            >
              ⊞
            </span>
            <span className="name">Dashboard Overview</span>
          </div>
        )}

        <div className="section-header-row">
          <button className="section-title" style={{ margin: 0 }} onClick={() => setColOpen((v) => !v)}>
            <span className="chev">{colOpen ? "v" : ">"}</span>
            COLLECTIONS
            <span className="section-count">{props.collections.length}</span>
          </button>
          <div className="section-header-actions">
            <button
              className={`header-action-btn col-sort-btn ${colSortOrder !== "default" ? "active" : ""}`}
              title={`Sort Collections: ${colSortOrder === "asc" ? "A to Z (Click for Z-A)" : colSortOrder === "desc" ? "Z to A (Click to Reset)" : "Default (Click to Sort A-Z)"}`}
              onClick={(e) => {
                e.stopPropagation();
                const nextOrder: "default" | "asc" | "desc" =
                  colSortOrder === "default" ? "asc" : colSortOrder === "asc" ? "desc" : "default";
                setColSortOrder(nextOrder);
                localStorage.setItem("pulse_col_sort", nextOrder);
              }}
              aria-label="Sort Collections"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M3 6h18M6 12h12m-9 6h6" />
              </svg>
              {colSortOrder !== "default" && (
                <span className="col-sort-badge">{colSortOrder === "asc" ? "A-Z" : "Z-A"}</span>
              )}
            </button>
            <button
              className="header-action-btn"
              title="Expand / Collapse All Folders"
              onClick={(e) => {
                e.stopPropagation();
                toggleAllFolders();
              }}
              aria-label="Expand or Collapse All Folders"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="7 8 12 3 17 8" />
                <polyline points="7 16 12 21 17 16" />
                <line x1="12" y1="3" x2="12" y2="21" />
              </svg>
            </button>
            <button
              className="header-action-btn"
              title="Add New Collection Folder (+Folder)"
              onClick={(e) => {
                e.stopPropagation();
                handleAddFolderPrompt();
              }}
              aria-label="Add Collection Folder"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
              </svg>
            </button>
            <button
              className="header-action-btn"
              title="Add New Collection (+Collection)"
              onClick={(e) => {
                e.stopPropagation();
                props.onNewCollection();
              }}
              aria-label="Add Collection"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
        </div>

        {colOpen && (
          <>
            {filtered.length === 0 && (
              <div className="empty" style={{ padding: "16px 8px" }}>
                <div>No collections yet</div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "center" }}>
                  <button className="btn sm primary" onClick={props.onNewCollection}>+ Collection</button>
                  <button className="btn sm" onClick={handleAddFolderPrompt}>+ Folder</button>
                </div>
              </div>
            )}
            {filtered.map((col) => (
              <div key={col.id} className="tree-col">
                <div
                  className="col-title"
                  onClick={() => setCollapsed((s) => ({ ...s, [col.id]: !s[col.id] }))}
                >
                  <button
                    className="icon-btn chev"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsed((s) => ({ ...s, [col.id]: !s[col.id] }));
                    }}
                    aria-label={collapsed[col.id] ? "Expand collection" : "Collapse collection"}
                  >
                    <Chevron open={!collapsed[col.id]} />
                  </button>
                  <span className="col-folder-icon">📁</span>
                  <span className="grow">{col.name}</span>
                  {(col.preScript || col.postScript) && (
                    <span
                      title={`Active collection scripts: ${[col.preScript ? "Pre-request" : null, col.postScript ? "Tests" : null].filter(Boolean).join(", ")} (Click to edit)`}
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onEditCollection?.(col.id, "scripts-pre");
                      }}
                      style={{
                        fontSize: 10,
                        padding: "1px 5px",
                        borderRadius: 4,
                        background: "var(--accent-soft)",
                        color: "var(--accent)",
                        fontWeight: 700,
                        marginRight: 4,
                        cursor: "pointer",
                      }}
                    >
                      ⚡
                    </span>
                  )}
                  <div className="tree-actions-group" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="tree-action-btn"
                      title="Collection Scripts & Settings"
                      onClick={() => props.onEditCollection?.(col.id, "scripts-pre")}
                    >
                      ⚡
                    </button>
                    <button
                      className="tree-action-btn"
                      title="Add Folder inside this collection"
                      onClick={() => props.onNewFolder(col.id, null)}
                    >
                      +📁
                    </button>
                    <button
                      className="tree-action-btn"
                      title="Add Request inside this collection"
                      onClick={() => props.onNewRequest(col.id, null)}
                    >
                      +
                    </button>
                    <button
                      className="tree-action-btn"
                      title="More options"
                      onClick={(e) => {
                        setMenu({ id: col.id, x: e.clientX, y: e.clientY });
                      }}
                    >
                      •••
                    </button>
                  </div>
                </div>
                {!collapsed[col.id] && (
                  <NodeList
                    nodes={col.children}
                    collectionId={col.id}
                    activeRequestId={props.activeRequestId}
                    collapsed={collapsed}
                    setCollapsed={setCollapsed}
                    isSearching={Boolean(query.trim())}
                    onOpenRequest={props.onOpenRequest}
                    onNewRequest={props.onNewRequest}
                    onNewFolder={props.onNewFolder}
                    onRenameNode={props.onRenameNode}
                    onDeleteNode={props.onDeleteNode}
                    onDuplicateNode={props.onDuplicateNode}
                  />
                )}
              </div>
            ))}
          </>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 4, marginTop: 10 }}>
          <button className="section-title env-section" style={{ flex: 1, marginBottom: 0 }} onClick={() => setEnvOpen((v) => !v)}>
            <span className="chev"><Chevron open={envOpen} /></span>
            ENVIRONMENTS
          </button>
          <button
            className="icon-btn"
            title="Create new environment"
            style={{ width: 20, height: 20, fontSize: 13, display: "grid", placeItems: "center" }}
            onClick={(e) => {
              e.stopPropagation();
              props.onNewEnv();
            }}
          >
            +
          </button>
        </div>
        {envOpen && (
          <>
            {props.environments.length === 0 && <div className="empty">No environments</div>}
            {props.environments.map((env) => (
              <div
                key={env.id}
                className={`env-row ${props.activeEnvId === env.id ? "active" : ""}`}
                onClick={() => props.onSelectEnv(env.id)}
              >
                <span className="env-dot">E</span>
                <span className="name" title={env.name}>{env.name}</span>
                {props.activeEnvId === env.id && <span className="env-check">&#10003;</span>}
                <div className="env-row-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="env-action-btn"
                    title={`Duplicate environment "${env.name}"`}
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onDuplicateEnv?.(env.id);
                    }}
                    aria-label={`Duplicate ${env.name}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  </button>
                  <button
                    className="env-action-btn"
                    title={`Edit environment "${env.name}"`}
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onEditEnv ? props.onEditEnv(env.id) : props.onManageEnv();
                    }}
                    aria-label={`Edit ${env.name}`}
                  >
                    ✏️
                  </button>
                  <button
                    className="env-action-btn danger-hover"
                    title={`Delete environment "${env.name}"`}
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onDeleteEnv?.(env.id);
                    }}
                    aria-label={`Delete ${env.name}`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
            <div className="env-actions-bar" style={{ display: "flex", gap: "6px", margin: "8px 6px 4px" }}>
              <button
                className="btn sm primary"
                style={{
                  flex: 1,
                  padding: "5px 6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                }}
                onClick={props.onNewEnv}
                title="Create a new environment"
              >
                <span>+</span> New Env
              </button>
              <button
                className="btn sm"
                style={{
                  flex: 1,
                  padding: "5px 6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                }}
                onClick={props.onManageEnv}
                title="Manage all environments and variables"
              >
                <span>⚙</span> Manage Env
              </button>
            </div>
          </>
        )}
      </div>

      {menu && (
        <div
          className="ctx"
          style={{ top: menu.y, left: Math.min(menu.x, 160) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              props.onEditCollection?.(menu.id, "scripts-pre");
              setMenu(null);
            }}
          >
            ⚡ Scripts & Settings
          </button>
          <button
            onClick={() => {
              props.onNewRequest(menu.id, null);
              setMenu(null);
            }}
          >
            Add request
          </button>
          <button
            onClick={() => {
              props.onNewFolder(menu.id, null);
              setMenu(null);
            }}
          >
            Add folder
          </button>
          <button
            onClick={() => {
              props.onRunCollection(menu.id);
              setMenu(null);
            }}
          >
            Run collection
          </button>
          <button
            onClick={() => {
              props.onExportCollection(menu.id);
              setMenu(null);
            }}
          >
            Export collection
          </button>
          {props.onDuplicateCollection && (
            <button
              onClick={() => {
                props.onDuplicateCollection?.(menu.id);
                setMenu(null);
              }}
            >
              Duplicate collection
            </button>
          )}
          <button
            onClick={() => {
              props.onRenameCollection(menu.id);
              setMenu(null);
            }}
          >
            Rename
          </button>
          <button
            onClick={() => {
              props.onDeleteCollection(menu.id);
              setMenu(null);
            }}
          >
            Delete
          </button>
        </div>
      )}

      {props.onStartResize && (
        <div
          className={`sidebar-resizer ${props.isResizing ? "active" : ""}`}
          onMouseDown={props.onStartResize}
          onDoubleClick={props.onResetResize}
          title="Drag to resize sidebar (double-click to reset)"
          role="separator"
          aria-orientation="vertical"
        />
      )}
    </aside>
  );
}

function filterNodes(nodes: TreeNode[], q: string): TreeNode[] {
  const out: TreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "request") {
      if (node.name.toLowerCase().includes(q) || node.url.toLowerCase().includes(q)) out.push(node);
    } else {
      const children = filterNodes(node.children, q);
      if (node.name.toLowerCase().includes(q) || children.length) {
        out.push({ ...node, children });
      }
    }
  }
  return out;
}

function NodeList(props: {
  nodes: TreeNode[];
  collectionId: string;
  activeRequestId: string | null;
  collapsed: Record<string, boolean>;
  setCollapsed: Dispatch<SetStateAction<Record<string, boolean>>>;
  isSearching?: boolean;
  onOpenRequest: (collectionId: string, requestId: string) => void;
  onNewRequest: (collectionId: string, folderId: string | null) => void;
  onNewFolder: (collectionId: string, folderId: string | null) => void;
  onRenameNode: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onDuplicateNode?: (id: string, collectionId: string) => void;
}) {
  return (
    <>
      {props.nodes.map((node) => {
        if (node.type === "folder") {
          const isFolderCollapsed = props.isSearching
            ? (props.collapsed[node.id] ?? false)
            : (props.collapsed[node.id] ?? true);

          return (
            <div key={node.id} className="tree-folder">
              <div
                className="tree-item folder-item"
                onClick={() => props.setCollapsed((s) => ({ ...s, [node.id]: !isFolderCollapsed }))}
              >
                <button
                  className="icon-btn chev"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.setCollapsed((s) => ({ ...s, [node.id]: !isFolderCollapsed }));
                  }}
                  aria-label={isFolderCollapsed ? "Expand folder" : "Collapse folder"}
                >
                  <Chevron open={!isFolderCollapsed} />
                </button>
                <span className="folder-ico">{isFolderCollapsed ? "📁" : "📂"}</span>
                <span className="name">{node.name}</span>
                <div className="tree-actions-group" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="tree-action-btn"
                    title="Add Subfolder inside this folder"
                    onClick={() => props.onNewFolder(props.collectionId, node.id)}
                  >
                    +📁
                  </button>
                  <button
                    className="tree-action-btn"
                    title="Add Request inside this folder"
                    onClick={() => props.onNewRequest(props.collectionId, node.id)}
                  >
                    +
                  </button>
                  {props.onDuplicateNode && (
                    <button
                      className="tree-action-btn"
                      title="Duplicate folder"
                      onClick={() => props.onDuplicateNode?.(node.id, props.collectionId)}
                    >
                      ⧉
                    </button>
                  )}
                  <button
                    className="tree-action-btn"
                    title="Rename folder"
                    onClick={() => props.onRenameNode(node.id)}
                  >
                    ✏️
                  </button>
                  <button
                    className="tree-action-btn danger-hover"
                    title="Delete folder"
                    onClick={() => {
                      if (window.confirm(`Delete folder "${node.name}" and all its contents?`)) {
                        props.onDeleteNode(node.id);
                      }
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
              {!isFolderCollapsed && <NodeList {...props} nodes={node.children} />}
            </div>
          );
        }

        return (
          <div
            key={node.id}
            className={`tree-item ${props.activeRequestId === node.id ? "active" : ""}`}
            onClick={() => props.onOpenRequest(props.collectionId, node.id)}
            onDoubleClick={() => props.onRenameNode(node.id)}
          >
            <span className={`method ${METHOD_COLORS[node.method]}`}>{shortMethod(node.method)}</span>
            <span className="name">{node.name}</span>
            <div className="tree-actions-group" onClick={(e) => e.stopPropagation()}>
              {props.onDuplicateNode && (
                <button
                  className="tree-action-btn"
                  title="Duplicate request"
                  onClick={() => props.onDuplicateNode?.(node.id, props.collectionId)}
                >
                  ⧉
                </button>
              )}
              <button
                className="tree-action-btn"
                title="Rename request"
                onClick={() => props.onRenameNode(node.id)}
              >
                ✏️
              </button>
              <button
                className="tree-action-btn danger-hover"
                title="Delete request"
                onClick={() => props.onDeleteNode(node.id)}
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

function shortMethod(m: string): string {
  if (m === "DELETE") return "DEL";
  if (m === "OPTIONS") return "OPT";
  if (m === "PATCH") return "PATCH";
  return m;
}
