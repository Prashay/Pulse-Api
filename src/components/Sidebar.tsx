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
  onRenameCollection: (id: string) => void;
  onDeleteCollection: (id: string) => void;
  onExportCollection: (id: string) => void;
  onRunCollection: (id: string) => void;
  onRenameNode: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onImportClick: () => void;
  onImportCurl: () => void;
  onSelectEnv: (id: string) => void;
  onManageEnv: () => void;
  onNewEnv: () => void;
}

export function Sidebar(props: Props) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [colOpen, setColOpen] = useState(true);
  const [envOpen, setEnvOpen] = useState(true);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [plusFilter, setPlusFilter] = useState("");
  const plusWrapperRef = useRef<HTMLDivElement>(null);
  const plusSearchInputRef = useRef<HTMLInputElement>(null);

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
    if (!q) return props.collections;
    return props.collections
      .map((col) => ({
        ...col,
        children: filterNodes(col.children, q),
      }))
      .filter((col) => col.name.toLowerCase().includes(q) || col.children.length > 0);
  }, [props.collections, query]);

  return (
    <aside className="sidebar" onClick={() => setMenu(null)}>
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

        <button className="section-title" onClick={() => setColOpen((v) => !v)}>
          <span className="chev">{colOpen ? "v" : ">"}</span>
          COLLECTIONS
        </button>
        {colOpen && (
          <>
            {filtered.length === 0 && <div className="empty">No collections</div>}
            {filtered.map((col) => (
              <div key={col.id} className="tree-col">
                <div className="col-title">
                  <button
                    className="icon-btn chev"
                    onClick={() => setCollapsed((s) => ({ ...s, [col.id]: !s[col.id] }))}
                  >
                    {collapsed[col.id] ? ">" : "v"}
                  </button>
                  <span
                    className="grow"
                    onClick={() => setCollapsed((s) => ({ ...s, [col.id]: !s[col.id] }))}
                  >
                    {col.name}
                  </span>
                  <button
                    className="icon-btn"
                    title="More"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu({ id: col.id, x: e.clientX, y: e.clientY });
                    }}
                  >
                    ...
                  </button>
                </div>
                {!collapsed[col.id] && (
                  <NodeList
                    nodes={col.children}
                    collectionId={col.id}
                    activeRequestId={props.activeRequestId}
                    collapsed={collapsed}
                    setCollapsed={setCollapsed}
                    onOpenRequest={props.onOpenRequest}
                    onNewRequest={props.onNewRequest}
                    onRenameNode={props.onRenameNode}
                    onDeleteNode={props.onDeleteNode}
                  />
                )}
              </div>
            ))}
          </>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 4 }}>
          <button className="section-title env-section" style={{ flex: 1, marginBottom: 0 }} onClick={() => setEnvOpen((v) => !v)}>
            <span className="chev">{envOpen ? "v" : ">"}</span>
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
                <span className="name">{env.name}</span>
                {props.activeEnvId === env.id && <span className="env-check">&#10003;</span>}
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
  onOpenRequest: (collectionId: string, requestId: string) => void;
  onNewRequest: (collectionId: string, folderId: string | null) => void;
  onRenameNode: (id: string) => void;
  onDeleteNode: (id: string) => void;
}) {
  return (
    <>
      {props.nodes.map((node) =>
        node.type === "folder" ? (
          <div key={node.id} className="tree-folder">
            <div className="tree-item folder-item">
              <button
                className="icon-btn chev"
                onClick={() => props.setCollapsed((s) => ({ ...s, [node.id]: !s[node.id] }))}
              >
                {props.collapsed[node.id] ? ">" : "v"}
              </button>
              <span className="folder-ico">[]</span>
              <span className="name">{node.name}</span>
            </div>
            {!props.collapsed[node.id] && <NodeList {...props} nodes={node.children} />}
          </div>
        ) : (
          <div
            key={node.id}
            className={`tree-item ${props.activeRequestId === node.id ? "active" : ""}`}
            onClick={() => props.onOpenRequest(props.collectionId, node.id)}
            onDoubleClick={() => props.onRenameNode(node.id)}
          >
            <span className={`method ${METHOD_COLORS[node.method]}`}>{shortMethod(node.method)}</span>
            <span className="name">{node.name}</span>
          </div>
        )
      )}
    </>
  );
}

function shortMethod(m: string): string {
  if (m === "DELETE") return "DEL";
  if (m === "OPTIONS") return "OPT";
  if (m === "PATCH") return "PATCH";
  return m;
}
