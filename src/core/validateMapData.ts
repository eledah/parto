import { ValidationError } from '../errors.js';
import type { ArgumentMapData, ArgumentMapNode } from '../types.js';

export interface ValidationResult {
  data: ArgumentMapData;
  warnings: string[];
}

export function validateMapData(input: unknown): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!input || typeof input !== 'object') {
    throw new ValidationError(['Map data must be an object']);
  }

  const record = input as Record<string, unknown>;
  if (!Array.isArray(record.new_nodes)) {
    throw new ValidationError(['Map data must include a new_nodes array']);
  }

  const nodes: ArgumentMapNode[] = [];
  const seenIds = new Set<string>();
  let thesisCount = 0;

  for (const raw of record.new_nodes) {
    if (!raw || typeof raw !== 'object') {
      issues.push('Each node must be an object');
      continue;
    }
    const node = raw as Record<string, unknown>;
    const id = String(node.id ?? '');
    if (!id) {
      issues.push('Node is missing id');
      continue;
    }
    if (seenIds.has(id)) {
      issues.push(`Duplicate node id: ${id}`);
      continue;
    }
    seenIds.add(id);

    const type = String(node.type ?? '');
    if (type === 'thesis') thesisCount += 1;

    const relations = Array.isArray(node.relations) ? node.relations : [];
    const normalizedRelations = relations.map((rel) => {
      const r = rel as Record<string, unknown>;
      const relationType = String(r.relation_type ?? '');
      if (relationType !== 'support' && relationType !== 'attack') {
        issues.push(`Node ${id} has unsupported relation_type: ${relationType}`);
      }
      return {
        target_node_id: String(r.target_node_id ?? ''),
        relation_type: relationType as 'support' | 'attack',
        reasoning: String(r.reasoning ?? ''),
      };
    });

    const normalized: ArgumentMapNode = {
      id,
      type,
      title: String(node.title ?? ''),
      description: String(node.description ?? ''),
      quote: String(node.quote ?? ''),
      speaker: String(node.speaker ?? ''),
      relations: normalizedRelations,
    };

    if (node.score && typeof node.score === 'object') {
      const score = node.score as Record<string, unknown>;
      normalized.score = {
        intensity: Number(score.intensity ?? 0),
        confidence: Number(score.confidence ?? 0),
      };
    }

    nodes.push(normalized);
  }

  if (issues.length > 0) {
    throw new ValidationError(issues);
  }

  if (thesisCount === 0) {
    throw new ValidationError(['Map must include exactly one thesis node']);
  }
  if (thesisCount > 1) {
    throw new ValidationError(['Map must include exactly one thesis node']);
  }

  const idSet = new Set(nodes.map((n) => n.id));
  for (const node of nodes) {
    for (const rel of node.relations) {
      if (!idSet.has(rel.target_node_id)) {
        warnings.push(`Node ${node.id} references missing target ${rel.target_node_id}`);
      }
    }
  }

  return { data: { new_nodes: nodes }, warnings };
}
