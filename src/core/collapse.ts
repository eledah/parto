import type { TreeNode } from '../types.js';

export const WEDGE_ID_SUFFIX = '__more';

export interface CollapseInput {
  /** Effective visual angular span (radians) per node pathKey, from the layout pass. */
  spans: Map<string, number>;
  /** Spans below this threshold collapse into "+N" wedges. */
  minAngle: number;
  /** Maximum hidden subtrees grouped per wedge. */
  chunkSize?: number;
}

export interface CollapseResult {
  /** Display tree with synthetic wedges; input tree is left untouched. */
  root: TreeNode;
  /** Number of wedges created. */
  wedgeCount: number;
}

export function isWedge(node: TreeNode): boolean {
  return node.wedgeMeta !== undefined;
}

/**
 * Rebuilds the tree, replacing sibling groups whose angular span falls below
 * minAngle with synthetic "+N" wedges. Hidden subtrees are kept inside the wedge
 * metadata so they can be materialized on focus (see expandWedge).
 *
 * Collapses bottom-up: inner rings are decided before outer rings, so a collapsed
 * branch never contributes its descendants to outer-ring crowding.
 */
export function applyCollapse(root: TreeNode, input: CollapseInput): CollapseResult {
  const { spans, minAngle } = input;
  const chunkSize = Math.max(1, input.chunkSize ?? 8);
  let wedgeCount = 0;

  const rebuild = (node: TreeNode): TreeNode => {
    const rebuilt: TreeNode[] = [];
    let buffer: TreeNode[] = [];

    const flushBuffer = () => {
      while (buffer.length > 0) {
        const chunk = buffer.splice(0, chunkSize);
        // Wrapping a single leaf adds no value — pass it through unchanged.
        if (chunk.length === 1 && chunk[0]!.children.length === 0) {
          rebuilt.push(chunk[0]!);
          continue;
        }
        rebuilt.push(createWedge(node, chunk, wedgeCount++));
      }
    };

    for (const child of node.children) {
      const newChild = rebuild(child);
      const span = spans.get(child.pathKey);
      const collapsible = span !== undefined && span < minAngle;
      if (collapsible) {
        buffer.push(newChild);
      } else {
        flushBuffer();
        rebuilt.push(newChild);
      }
    }
    flushBuffer();

    return { ...node, children: rebuilt };
  };

  return { root: rebuild(root), wedgeCount };
}

/** Majority relation color of the hidden group decides the wedge chip/styling. */
function majorityRelation(hidden: TreeNode[]): 'support' | 'attack' | undefined {
  let support = 0;
  let attack = 0;
  for (const node of hidden) {
    if (node.relationType === 'attack') attack++;
    else support++;
  }
  if (support === 0 && attack === 0) return undefined;
  return attack > support ? 'attack' : 'support';
}

function createWedge(parent: TreeNode, hidden: TreeNode[], seq: number): TreeNode {
  const count = hidden.reduce((sum, node) => sum + Math.max(1, node.value), 0);
  const titles = hidden.slice(0, 5).map((node) => node.title).filter(Boolean);
  const suffix = `${WEDGE_ID_SUFFIX}${seq > 0 ? `_${seq}` : ''}`;

  const wedge: TreeNode = {
    ...parent,
    id: `${parent.id}${suffix}`,
    title: `+${count}`,
    description: titles.join(' • '),
    quote: '',
    speaker: '',
    relations: [],
    children: [],
    value: count,
    relationType: majorityRelation(hidden),
    relationReasoning: undefined,
    parentId: parent.id,
    pathKey: `${parent.pathKey}/${suffix}`,
  };
  // Never inherit a parent's meta (possible inside expanded-wedge focus views).
  wedge.wedgeMeta = { count, titles, hidden };
  return wedge;
}

/**
 * Materializes a wedge back into a navigable node whose hidden subtrees become
 * real children again. PathKeys are re-prefixed with the wedge pathKey so DOM
 * keys stay unique even when the same source node occurs in multiple places.
 */
export function expandWedge(wedge: TreeNode): TreeNode | null {
  const meta = wedge.wedgeMeta;
  if (!meta || meta.hidden.length === 0) return null;

  const cloneSubtree = (node: TreeNode, prefixPath: string): TreeNode => {
    const pathKey = `${prefixPath}/${node.id}`;
    return {
      ...node,
      pathKey,
      children: node.children.map((child) => cloneSubtree(child, pathKey)),
    };
  };

  return {
    ...wedge,
    title: `+${meta.count} arguments`,
    children: meta.hidden.map((node) => cloneSubtree(node, wedge.pathKey)),
  };
}
