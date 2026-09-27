import type { Collection, FolderItem, RequestItem, TreeNode } from "./types";

export function findRequest(
  collections: Collection[],
  requestId: string
): { collection: Collection; request: RequestItem } | null {
  for (const col of collections) {
    const hit = findInNodes(col.children, requestId);
    if (hit) return { collection: col, request: hit };
  }
  return null;
}

function findInNodes(nodes: TreeNode[], id: string): RequestItem | null {
  for (const node of nodes) {
    if (node.type === "request" && node.id === id) return node;
    if (node.type === "folder") {
      const hit = findInNodes(node.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

export function mapNodes(
  nodes: TreeNode[],
  mapper: (node: TreeNode) => TreeNode
): TreeNode[] {
  return nodes.map((node) => {
    const next = mapper(node);
    if (next.type === "folder") {
      return { ...next, children: mapNodes(next.children, mapper) };
    }
    return next;
  });
}

export function updateRequest(
  collections: Collection[],
  requestId: string,
  updater: (req: RequestItem) => RequestItem
): Collection[] {
  return collections.map((col) => ({
    ...col,
    children: mapNodes(col.children, (node) =>
      node.type === "request" && node.id === requestId ? updater(node) : node
    ),
  }));
}

export function insertNode(
  collections: Collection[],
  collectionId: string,
  folderId: string | null,
  node: TreeNode
): Collection[] {
  return collections.map((col) => {
    if (col.id !== collectionId) return col;
    if (!folderId) return { ...col, children: [...col.children, node] };
    return {
      ...col,
      children: insertIntoFolder(col.children, folderId, node),
    };
  });
}

function insertIntoFolder(
  nodes: TreeNode[],
  folderId: string,
  node: TreeNode
): TreeNode[] {
  return nodes.map((n) => {
    if (n.type === "folder" && n.id === folderId) {
      return { ...n, children: [...n.children, node] };
    }
    if (n.type === "folder") {
      return { ...n, children: insertIntoFolder(n.children, folderId, node) };
    }
    return n;
  });
}

export function removeNode(
  collections: Collection[],
  nodeId: string
): Collection[] {
  return collections.map((col) => ({
    ...col,
    children: removeFromNodes(col.children, nodeId),
  }));
}

function removeFromNodes(nodes: TreeNode[], nodeId: string): TreeNode[] {
  return nodes
    .filter((n) => n.id !== nodeId)
    .map((n) =>
      n.type === "folder" ? { ...n, children: removeFromNodes(n.children, nodeId) } : n
    );
}

export function renameNode(
  collections: Collection[],
  nodeId: string,
  name: string
): Collection[] {
  return collections.map((col) => ({
    ...col,
    children: mapNodes(col.children, (node) =>
      node.id === nodeId ? { ...node, name } : node
    ),
  }));
}

export function parentFolderId(
  nodes: TreeNode[],
  nodeId: string,
  parent: string | null = null
): string | null | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return parent;
    if (node.type === "folder") {
      const hit = parentFolderId(node.children, nodeId, node.id);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

export function duplicateNode(node: TreeNode): TreeNode {
  const { uid } = { uid: (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}` };
  if (node.type === "request") {
    return { ...node, id: uid("req"), name: `${node.name} Copy` };
  }
  const folder: FolderItem = {
    ...node,
    id: uid("fld"),
    name: `${node.name} Copy`,
    children: node.children.map(duplicateNode),
  };
  return folder;
}
