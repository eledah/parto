import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors.js';
import { validateMapData } from '../src/core/validateMapData.js';

describe('validateMapData', () => {
  it('accepts valid map data', () => {
    const result = validateMapData({
      new_nodes: [
        {
          id: '1',
          type: 'thesis',
          title: 'T',
          description: '',
          quote: '',
          speaker: '',
          relations: [],
        },
      ],
    });
    expect(result.data.new_nodes).toHaveLength(1);
  });

  it('rejects missing thesis', () => {
    expect(() =>
      validateMapData({
        new_nodes: [
          {
            id: '1',
            type: 'claim',
            title: 'T',
            description: '',
            quote: '',
            speaker: '',
            relations: [],
          },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it('rejects duplicate ids', () => {
    expect(() =>
      validateMapData({
        new_nodes: [
          {
            id: '1',
            type: 'thesis',
            title: 'T',
            description: '',
            quote: '',
            speaker: '',
            relations: [],
          },
          {
            id: '1',
            type: 'claim',
            title: 'Dup',
            description: '',
            quote: '',
            speaker: '',
            relations: [],
          },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it('warns on missing relation targets', () => {
    const result = validateMapData({
      new_nodes: [
        {
          id: '1',
          type: 'thesis',
          title: 'T',
          description: '',
          quote: '',
          speaker: '',
          relations: [],
        },
        {
          id: '2',
          type: 'claim',
          title: 'Orphan ref',
          description: '',
          quote: '',
          speaker: '',
          relations: [{ target_node_id: 'missing', relation_type: 'support', reasoning: '' }],
        },
      ],
    });
    expect(result.warnings.some((w) => w.includes('missing'))).toBe(true);
  });
});
