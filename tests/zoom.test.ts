import { describe, expect, it } from 'vitest';
import { buildTree } from '../src/core/buildTree.js';
import { ZoomController } from '../src/core/ZoomController.js';
import type { ArgumentMapNode } from '../src/types.js';

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
    relations: [{ target_node_id: '2', relation_type: 'attack', reasoning: '' }],
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
    expect(zoom.getZoomPath().map((node) => node.relationType)).toEqual([
      undefined,
      'support',
      'attack',
    ]);
  });
});
