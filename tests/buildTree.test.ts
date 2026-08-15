import { describe, expect, it } from 'vitest';
import { buildTree } from '../src/core/buildTree.js';
import type { ArgumentMapNode } from '../src/types.js';

const sampleNodes: ArgumentMapNode[] = [
  {
    id: '1',
    type: 'thesis',
    title: 'Root claim',
    description: '',
    quote: '',
    speaker: 'A',
    relations: [],
  },
  {
    id: '2',
    type: 'claim',
    title: 'Support',
    description: 'Supports root',
    quote: '',
    speaker: 'B',
    relations: [{ target_node_id: '1', relation_type: 'support', reasoning: 'Because' }],
  },
  {
    id: '3',
    type: 'claim',
    title: 'Attack',
    description: 'Attacks root',
    quote: '',
    speaker: 'C',
    relations: [{ target_node_id: '1', relation_type: 'attack', reasoning: 'However' }],
  },
];

describe('buildTree', () => {
  it('builds a tree with thesis root and ordered children', () => {
    const { tree, warnings } = buildTree(sampleNodes);
    expect(warnings).toHaveLength(0);
    expect(tree?.id).toBe('1');
    expect(tree?.children).toHaveLength(2);
    expect(tree?.children[0]?.relationType).toBe('support');
    expect(tree?.children[1]?.relationType).toBe('attack');
  });

  it('returns null when no thesis exists', () => {
    const nodes = sampleNodes.filter((n) => n.type !== 'thesis');
    const { tree } = buildTree(nodes);
    expect(tree).toBeNull();
  });

  it('assigns unique pathKeys', () => {
    const { tree } = buildTree(sampleNodes);
    expect(tree?.pathKey).toBe('1');
    expect(tree?.children[0]?.pathKey).toBe('1/2');
  });

  it('handles root-only map', () => {
    const { tree } = buildTree([sampleNodes[0]!]);
    expect(tree?.children).toHaveLength(0);
  });
});
