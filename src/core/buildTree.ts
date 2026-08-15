import type { ArgumentMapNode, TreeNode } from '../types.js';

export interface BuildTreeResult {
  tree: TreeNode | null;
  warnings: string[];
}

/**
 * Build a nested tree from flat nodes. Uses adjacency indexing for O(n + edges).
 * Multi-parent nodes appear under each parent as separate copies with unique pathKeys.
 */
export function buildTree(nodes: ArgumentMapNode[]): BuildTreeResult {
  const warnings: string[] = [];
  const nodeMap = new Map<string, ArgumentMapNode>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  const thesisNode = nodes.find((n) => n.type === 'thesis');
  if (!thesisNode) {
    return { tree: null, warnings: ['No thesis node found'] };
  }

  /** parentId -> list of { childId, relation } */
  const childrenOf = new Map<string, { childId: string; relationType: string; reasoning: string }[]>();

  for (const node of nodes) {
    for (const rel of node.relations) {
      if (!nodeMap.has(rel.target_node_id)) continue;
      const list = childrenOf.get(rel.target_node_id) ?? [];
      list.push({
        childId: node.id,
        relationType: rel.relation_type,
        reasoning: rel.reasoning,
      });
      childrenOf.set(rel.target_node_id, list);
    }
  }

  const buildRecursive = (
    source: ArgumentMapNode,
    parentId: string | undefined,
    relationType: string | undefined,
    relationReasoning: string | undefined,
    ancestorIds: Set<string>,
    pathSegments: string[],
  ): TreeNode => {
    const pathKey = pathSegments.join('/');
    const treeNode: TreeNode = {
      ...source,
      children: [],
      value: 1,
      relationType: relationType as TreeNode['relationType'],
      relationReasoning,
      parentId,
      pathKey,
    };

    if (ancestorIds.has(source.id)) {
      warnings.push(`Cycle detected at node ${source.id}; branch skipped`);
      return treeNode;
    }

    const nextAncestors = new Set(ancestorIds);
    nextAncestors.add(source.id);

    const childEntries = childrenOf.get(source.id) ?? [];
    for (const entry of childEntries) {
      const childSource = nodeMap.get(entry.childId);
      if (!childSource) continue;
      const childCopy = buildRecursive(
        childSource,
        source.id,
        entry.relationType,
        entry.reasoning,
        nextAncestors,
        [...pathSegments, entry.childId],
      );
      treeNode.children.push(childCopy);
    }

    return treeNode;
  };

  const tree = buildRecursive(thesisNode, undefined, undefined, undefined, new Set(), [thesisNode.id]);
  return { tree, warnings };
}

export function findNodeById(root: TreeNode | null, id: string): TreeNode | null {
  if (!root) return null;
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

export function findNodeByPath(root: TreeNode | null, nodeIds: string[]): TreeNode | null {
  if (!root || nodeIds.length === 0) return null;
  let current: TreeNode | null = root;
  for (let i = 1; i < nodeIds.length; i++) {
    const targetId = nodeIds[i];
    current = current?.children.find((c) => c.id === targetId) ?? null;
    if (!current) return null;
  }
  return current;
}

export function pathToNode(root: TreeNode, targetId: string): TreeNode[] {
  const path: TreeNode[] = [];

  const walk = (node: TreeNode, ancestors: TreeNode[]): boolean => {
    const chain = [...ancestors, node];
    if (node.id === targetId) {
      path.push(...chain);
      return true;
    }
    for (const child of node.children) {
      if (walk(child, chain)) return true;
    }
    return false;
  };

  walk(root, []);
  return path;
}

export function getNodeArcClass(node: TreeNode, currentRoot: TreeNode | null): string {
  if (currentRoot && node.id === currentRoot.id) return 'pam-arc--center';
  if (node.relationType === 'attack') return 'pam-arc--attack';
  return 'pam-arc--support';
}

export function getNodeColor(
  node: TreeNode,
  currentRoot: TreeNode | null,
  colors: { center: string; support: string; attack: string },
): string {
  if (currentRoot && node.id === currentRoot.id) return colors.center;
  return node.relationType === 'attack' ? colors.attack : colors.support;
}
