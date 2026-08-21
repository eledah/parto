import { findNodeById, findNodeByPath, pathToNode } from './buildTree.js';
import { expandWedge, isWedge } from './collapse.js';
import type { NodeContext, TreeNode } from '../types.js';

export class ZoomController {
  private fullTree: TreeNode | null = null;
  private zoomStack: TreeNode[] = [];
  /** Branch chosen by auto-focus; resetZoom returns here instead of the full tree. */
  private autoFocusEntry: TreeNode | null = null;

  setTree(tree: TreeNode | null): void {
    this.fullTree = tree;
    this.zoomStack = tree ? [tree] : [];
    this.autoFocusEntry = null;
  }

  getFocusRoot(): TreeNode | null {
    if (this.zoomStack.length === 0) return null;
    return this.zoomStack[this.zoomStack.length - 1] ?? null;
  }

  getFullTree(): TreeNode | null {
    return this.fullTree;
  }

  getZoomPath(): NodeContext[] {
    return this.zoomStack.map((n) => ({ id: n.id, title: n.title, type: n.type }));
  }

  resetZoom(): void {
    if (this.fullTree) {
      this.zoomStack = [this.fullTree];
      if (this.autoFocusEntry) {
        this.zoomStack.push(this.autoFocusEntry);
      }
    }
  }

  /**
   * When the rendered tree is deeper than maxVisibleDepth, focus into the heaviest
   * (leaf-weighted) first-level branch so deep maps open readable instead of cramped.
   */
  autoFocusDeep(maxVisibleDepth: number): boolean {
    const root = this.fullTree;
    if (!root || root.children.length === 0) return false;
    if (this.maxDepth(root) <= maxVisibleDepth) return false;

    let heaviest = root.children[0]!;
    for (const child of root.children) {
      if (child.value > heaviest.value) heaviest = child;
    }
    this.autoFocusEntry = heaviest;
    this.zoomStack = [root, heaviest];
    return true;
  }

  private maxDepth(node: TreeNode): number {
    let depth = 0;
    for (const child of node.children) {
      depth = Math.max(depth, this.maxDepth(child) + 1);
    }
    return depth;
  }

  zoomTo(nodeId: string): boolean {
    if (!this.fullTree) return false;
    const path = pathToNode(this.fullTree, nodeId);
    if (path.length === 0) return false;
    const target = path[path.length - 1];
    if (!target) return false;
    this.zoomStack = path;
    return true;
  }

  zoomToPath(nodeIds: string[]): boolean {
    if (!this.fullTree || nodeIds.length === 0) return false;
    const target = findNodeByPath(this.fullTree, nodeIds);
    if (!target) return false;
    const path: TreeNode[] = [];
    let current: TreeNode | undefined = this.fullTree;
    path.push(current);
    for (let i = 1; i < nodeIds.length; i++) {
      const id = nodeIds[i]!;
      const child: TreeNode | undefined = current!.children.find((c) => c.id === id);
      if (!child) return false;
      path.push(child);
      current = child;
    }
    this.zoomStack = path;
    return true;
  }

  zoomIn(node: TreeNode): boolean {
    if ((node.children?.length ?? 0) === 0) return false;
    this.zoomStack.push(node);
    return true;
  }

  zoomOut(): boolean {
    if (this.zoomStack.length <= 1) return false;
    this.zoomStack.pop();
    return true;
  }

  handleClick(node: TreeNode, depth: number, hasChildren: boolean): void {
    if (depth === 0) {
      this.zoomOut();
      return;
    }
    if (isWedge(node)) {
      const expanded = expandWedge(node);
      if (expanded) this.zoomStack.push(expanded);
      return;
    }
    if (hasChildren) {
      const found = findNodeById(this.getFocusRoot(), node.id);
      if (found) this.zoomIn(found);
    }
  }
}
