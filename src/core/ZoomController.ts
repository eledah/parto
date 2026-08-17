import { findNodeById, findNodeByPath, pathToNode } from './buildTree.js';
import type { NodeContext, TreeNode } from '../types.js';

export class ZoomController {
  private fullTree: TreeNode | null = null;
  private zoomStack: TreeNode[] = [];

  setTree(tree: TreeNode | null): void {
    this.fullTree = tree;
    this.zoomStack = tree ? [tree] : [];
  }

  getFocusRoot(): TreeNode | null {
    if (this.zoomStack.length === 0) return null;
    return this.zoomStack[this.zoomStack.length - 1] ?? null;
  }

  getFullTree(): TreeNode | null {
    return this.fullTree;
  }

  getZoomPath(): NodeContext[] {
    return this.zoomStack.map((n) => ({
      id: n.id,
      title: n.title,
      type: n.type,
      relationType: n.relationType,
    }));
  }

  resetZoom(): void {
    if (this.fullTree) {
      this.zoomStack = [this.fullTree];
    }
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
    if (hasChildren) {
      const found = findNodeById(this.getFocusRoot(), node.id);
      if (found) this.zoomIn(found);
    }
  }
}
