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

  it('weights nodes by descendant leaf count', () => {
    const { tree } = buildTree(sampleNodes);
    expect(tree?.value).toBe(2); // thesis with two leaf children
    for (const child of tree!.children) {
      expect(child.value).toBe(1);
    }
  });

  it('deep branches outweigh shallow ones', () => {
    const deep = sampleNodes.map((n) => ({ ...n }));
    const { tree } = buildTree([
      ...deep,
      {
        id: '4',
        type: 'claim',
        title: 'Deep child A',
        description: '',
        quote: '',
        speaker: '',
        relations: [{ target_node_id: '2', relation_type: 'support', reasoning: '' }],
      },
      {
        id: '5',
        type: 'claim',
        title: 'Deep child B',
        description: '',
        quote: '',
        speaker: '',
        relations: [{ target_node_id: '2', relation_type: 'support', reasoning: '' }],
      },
    ]);
    const support = tree!.children[0]!;
    const attack = tree!.children[1]!;
    expect(support.children).toHaveLength(2);
    expect(support.value).toBeGreaterThan(attack.value);
    expect(tree!.value).toBe(3); // leaves: '3', '4', '5'
  });
});
