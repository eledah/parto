import { describe, expect, it } from 'vitest';
import { buildTree } from '../src/core/buildTree.js';
import { ZoomController } from '../src/core/ZoomController.js';
import type { ArgumentMapNode, TreeNode } from '../src/types.js';

const nodes: ArgumentMapNode[] = [
  {
    id: '1',
    type: 'thesis',
    title: 'Root',
    description: '',
    quote: '',
    speaker: '',
    relations: [],
  },
  {
    id: '2',
    type: 'claim',
    title: 'Child',
    description: '',
    quote: '',
    speaker: '',
    relations: [{ target_node_id: '1', relation_type: 'support', reasoning: '' }],
  },
  {
    id: '3',
    type: 'claim',
    title: 'Grandchild',
    description: '',
    quote: '',
    speaker: '',
    relations: [{ target_node_id: '2', relation_type: 'support', reasoning: '' }],
  },
];

describe('ZoomController', () => {
  it('zooms in and out along the stack', () => {
    const { tree } = buildTree(nodes);
    const zoom = new ZoomController();
    zoom.setTree(tree);
    expect(zoom.getFocusRoot()?.id).toBe('1');

    const child = zoom.getFocusRoot()?.children[0];
    expect(child).toBeTruthy();
    zoom.zoomIn(child!);
    expect(zoom.getFocusRoot()?.id).toBe('2');

    zoom.zoomOut();
    expect(zoom.getFocusRoot()?.id).toBe('1');
  });

  it('zoomToPath selects exact branch', () => {
    const { tree } = buildTree(nodes);
    const zoom = new ZoomController();
    zoom.setTree(tree);
    expect(zoom.zoomToPath(['1', '2', '3'])).toBe(true);
    expect(zoom.getFocusRoot()?.id).toBe('3');
  });

  describe('autoFocusDeep', () => {
    function deepTree() {
      // thesis(1) -> A(2) [3 leaves across two levels], B(9) [1 leaf]
      const mapNodes: ArgumentMapNode[] = [
        nodes[0]!,
        nodes[1]!,
        nodes[2]!,
        {
          id: '9',
          type: 'claim',
          title: 'Shallow sibling',
          description: '',
          quote: '',
          speaker: '',
          relations: [{ target_node_id: '1', relation_type: 'attack', reasoning: '' }],
        },
        {
          id: '4',
          type: 'claim',
          title: 'A-child',
          description: '',
          quote: '',
          speaker: '',
          relations: [{ target_node_id: '2', relation_type: 'support', reasoning: '' }],
        },
        {
          id: '5',
          type: 'claim',
          title: 'Deep 5',
          description: '',
          quote: '',
          speaker: '',
          relations: [{ target_node_id: '4', relation_type: 'support', reasoning: '' }],
        },
        {
          id: '6',
          type: 'claim',
          title: 'Deep 6',
          description: '',
          quote: '',
          speaker: '',
          relations: [{ target_node_id: '5', relation_type: 'support', reasoning: '' }],
        },
        {
          id: '7',
          type: 'claim',
          title: 'Deep 7',
          description: '',
          quote: '',
          speaker: '',
          relations: [{ target_node_id: '6', relation_type: 'support', reasoning: '' }],
        },
      ];
      return buildTree(mapNodes).tree!;
    }

    it('focuses the heaviest branch when deeper than maxVisibleDepth', () => {
      const tree = deepTree();
      const zoom = new ZoomController();
      zoom.setTree(tree);
      expect(zoom.autoFocusDeep(2)).toBe(true);
      expect(zoom.getFocusRoot()?.id).toBe('2'); // heaviest first-level branch
      expect(zoom.getZoomPath()).toHaveLength(2);
    });

    it('does nothing for shallow trees', () => {
      const { tree } = buildTree(nodes);
      const zoom = new ZoomController();
      zoom.setTree(tree);
      expect(zoom.autoFocusDeep(4)).toBe(false);
      expect(zoom.getFocusRoot()?.id).toBe('1');
    });

    it('resetZoom returns to the auto-focus entry, not the full cramped tree', () => {
      const tree = deepTree();
      const zoom = new ZoomController();
      zoom.setTree(tree);
      zoom.autoFocusDeep(2);
      zoom.zoomOut(); // user backs out once
      zoom.resetZoom();
      expect(zoom.getFocusRoot()?.id).toBe('2');
    });

    it('setTree clears the auto-focus entry', () => {
      const zoom = new ZoomController();
      zoom.setTree(deepTree());
      zoom.autoFocusDeep(2);
      zoom.setTree(buildTree(nodes).tree);
      zoom.resetZoom();
      expect(zoom.getFocusRoot()?.id).toBe('1');
    });
  });

  describe('wedge navigation', () => {
    function wedgeWith(hidden: TreeNode): TreeNode {
      return {
        ...hidden,
        id: 'w__more',
        pathKey: '1/__more',
        title: '+1',
        children: [],
        wedgeMeta: { count: 1, titles: [hidden.title], hidden: [hidden] },
      };
    }

    it('expands a clicked wedge into a focusable node', () => {
      const { tree } = buildTree(nodes);
      const zoom = new ZoomController();
      zoom.setTree(tree);

      const hiddenBranch = tree.children[0]!;
      const wedge = wedgeWith(hiddenBranch);
      zoom.handleClick(wedge, 2, true);

      const focusRoot = zoom.getFocusRoot()!;
      expect(focusRoot.id).toBe('w__more');
      expect(focusRoot.children[0]?.id).toBe(hiddenBranch.id);
      expect(focusRoot.children[0]?.pathKey.startsWith(`${wedge.pathKey}/`)).toBe(true);
    });

    it('pops back to the wedge view on zoomOut', () => {
      const { tree } = buildTree(nodes);
      const zoom = new ZoomController();
      zoom.setTree(tree);
      const wedge = wedgeWith(tree.children[0]!);
      zoom.handleClick(wedge, 2, true);
      zoom.zoomOut();
      expect(zoom.getFocusRoot()?.id).toBe('1');
    });
  });
});
