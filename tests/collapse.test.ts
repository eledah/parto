import { describe, expect, it } from 'vitest';
import { applyCollapse, expandWedge, isWedge } from '../src/core/collapse.js';
import type { TreeNode } from '../src/types.js';

let nextId = 0;
function makeNode(title: string, children: TreeNode[] = []): TreeNode {
  nextId += 1;
  const id = `n${nextId}`;
  return {
    id,
    type: 'claim',
    title,
    description: '',
    quote: '',
    speaker: '',
    relations: [],
    children,
    value: children.length === 0 ? 1 : children.reduce((sum, c) => sum + c.value, 0),
    pathKey: id,
  };
}

/** Uniform spans for every node except those listed in overrides (by id). */
function buildSpans(root: TreeNode, overrides: Record<string, number>): Map<string, number> {
  const spans = new Map<string, number>();
  const walk = (node: TreeNode): void => {
    spans.set(node.pathKey, overrides[node.id] ?? 1);
    node.children.forEach(walk);
  };
  walk(root);
  return spans;
}

describe('applyCollapse', () => {
  it('leaves trees without narrow arcs structurally unchanged', () => {
    const tree = makeNode('root', [makeNode('a'), makeNode('b')]);
    const { root, wedgeCount } = applyCollapse(tree, {
      spans: buildSpans(tree, {}),
      minAngle: 0.05,
    });
    expect(wedgeCount).toBe(0);
    expect(isWedge(root)).toBe(false);
    expect(root.children.map((c) => c.id)).toEqual(tree.children.map((c) => c.id));
  });

  it('collapses narrow branches and keeps visible siblings in order', () => {
    const narrowA = makeNode('narrowA', [makeNode('child1'), makeNode('child2')]);
    const wide = makeNode('wide');
    const narrowB = makeNode('narrowB', [makeNode('child3')]);
    const tree = makeNode('root', [narrowA, wide, narrowB]);

    const { root, wedgeCount } = applyCollapse(tree, {
      spans: buildSpans(tree, { [narrowA.id]: 0.01, [narrowB.id]: 0.02 }),
      minAngle: 0.05,
    });

    expect(wedgeCount).toBe(2);
    expect(root.children).toHaveLength(3);
    const [wedge1, visible, wedge2] = root.children;
    expect(visible?.id).toBe(wide.id);
    expect(isWedge(wedge1!)).toBe(true);
    expect(wedge1?.title).toBe('+2'); // two hidden leaves
    expect(isWedge(wedge2!)).toBe(true);
    expect(wedge2?.title).toBe('+1');
    expect(wedge1?.pathKey).not.toBe(wedge2?.pathKey);
  });

  it('groups runs of tiny leaf siblings into wedges, in order', () => {
    const a = makeNode('tiny-a');
    const big = makeNode('big');
    const b = makeNode('tiny-b');
    const c = makeNode('tiny-c');
    const tree = makeNode('root', [a, big, b, c]);

    const { root, wedgeCount } = applyCollapse(tree, {
      spans: buildSpans(tree, { [a.id]: 0.01, [b.id]: 0.01, [c.id]: 0.01 }),
      minAngle: 0.05,
    });

    // 'a' sits alone before a wide sibling, so it passes through unwrapped;
    // b and c form a run and collapse together.
    expect(wedgeCount).toBe(1);
    expect(root.children.map((c) => c.title)).toEqual(['tiny-a', 'big', '+2']);
  });

  it('passes a lone tiny leaf through without wrapping it', () => {
    const lone = makeNode('lone');
    const tree = makeNode('root', [lone]);
    const { root, wedgeCount } = applyCollapse(tree, {
      spans: buildSpans(tree, { [lone.id]: 0.001 }),
      minAngle: 0.05,
    });
    expect(wedgeCount).toBe(0);
    expect(root.children[0]?.id).toBe(lone.id);
    expect(isWedge(root.children[0]!)).toBe(false);
  });

  it('chunks large hidden groups by chunkSize', () => {
    const leaves = Array.from({ length: 20 }, (_, i) => makeNode(`h${i}`));
    const branch = makeNode('branch', leaves);
    const tree = makeNode('root', [branch]);

    const overrides: Record<string, number> = {};
    for (const leaf of leaves) overrides[leaf.id] = 0.005;

    const { root } = applyCollapse(tree, {
      spans: buildSpans(tree, overrides),
      minAngle: 0.05,
      chunkSize: 8,
    });

    const sizes = root.children[0]!.children.map((c) => c.title);
    expect(sizes).toEqual(['+8', '+8', '+4']);
  });

  it('does not mutate the input tree', () => {
    const narrow = makeNode('narrow', [makeNode('x')]);
    const tree = makeNode('root', [narrow]);
    applyCollapse(tree, {
      spans: buildSpans(tree, { [narrow.id]: 0.01 }),
      minAngle: 0.05,
    });
    expect(tree.children[0]?.id).toBe(narrow.id);
    expect(tree.children[0]?.wedgeMeta).toBeUndefined();
    expect(tree.children[0]?.children).toHaveLength(1);
  });
});

describe('expandWedge', () => {
  it('materializes hidden subtrees with unique re-prefixed pathKeys', () => {
    const grandchild = makeNode('grandchild');
    const child = makeNode('child', [grandchild]);
    const tree = makeNode('root', [child]);
    const { root } = applyCollapse(tree, {
      spans: buildSpans(tree, { [child.id]: 0.01 }),
      minAngle: 0.05,
    });
    const wedge = root.children.find(isWedge)!;
    const expanded = expandWedge(wedge)!;

    expect(expanded.children).toHaveLength(1);
    const expandedChild = expanded.children[0]!;
    expect(expandedChild.id).toBe(child.id);
    expect(expandedChild.pathKey.startsWith(`${wedge.pathKey}/`)).toBe(true);
    expect(expandedChild.children[0]!.pathKey.startsWith(`${expandedChild.pathKey}/`)).toBe(true);
  });

  it('returns null for non-wedges and empty wedges', () => {
    expect(expandWedge(makeNode('plain'))).toBeNull();
    const empty: TreeNode = {
      ...makeNode('w'),
      wedgeMeta: { count: 0, titles: [], hidden: [] },
    };
    expect(expandWedge(empty)).toBeNull();
  });

  it('exposes preview titles for tooltips', () => {
    const kids = Array.from({ length: 6 }, (_, i) => makeNode(`preview ${i}`));
    const branch = makeNode('branch', kids);
    const tree = makeNode('root', [branch]);

    const overrides: Record<string, number> = {};
    for (const kid of kids) overrides[kid.id] = 0.001;

    const { root } = applyCollapse(tree, {
      spans: buildSpans(tree, overrides),
      minAngle: 0.05,
    });
    const wedge = root.children[0]!.children.find(isWedge)!;
    expect(wedge.title).toBe('+6');
    expect(wedge.description.split(' • ')).toHaveLength(5);
    expect(wedge.wedgeMeta?.titles[0]).toContain('preview');
  });
});
