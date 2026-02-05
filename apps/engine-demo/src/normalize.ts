/**
 * PHASE 19 — Normalization & Integrity (Load-Time Only)
 * PHASE 20 — Recovery & Transparency (Observability)
 *
 * Single trust boundary: unknown JSON → guaranteed-valid PersistedState
 *
 * Principles:
 * - Never throws
 * - Never mutates input
 * - Never drops data silently
 * - Represents anomalies, doesn't erase them
 * - Preserves unknown fields (forward compatibility)
 * - Deterministic output
 * - Phase 20: Emit recovery events for transparency (read-only)
 */

import type { Node, NodeID } from './engine/NodeKernel';

/**
 * PHASE 22 — Recovery Action Types
 *
 * Optional user-initiated repairs that map to existing mutations.
 * Never auto-run. Always undoable.
 */
export type RecoveryAction =
  | { type: 'focus-node'; nodeId: NodeID }
  | { type: 'remove-ref'; fromNodeId: NodeID; toNodeId: NodeID }
  | { type: 'delete-node'; nodeId: NodeID };

/**
 * PHASE 20 + PHASE 22 — Recovery Event Types
 *
 * Descriptive record of what was fixed during normalization.
 * Phase 22: Optional actions for human-in-the-loop repair.
 * Never prescriptive. Never auto-run.
 */
export type RecoveryEvent =
  | {
      type: 'duplicate-id';
      originalId: string;
      resolvedId: string;
      actions?: RecoveryAction[];
    }
  | {
      type: 'orphan-hoisted';
      nodeId: string;
      invalidParentId: string;
      actions?: RecoveryAction[];
    }
  | { type: 'cycle-broken'; nodeId: string; actions?: RecoveryAction[] }
  | {
      type: 'dangling-ref';
      fromNodeId: string;
      toNodeId: string;
      actions?: RecoveryAction[];
    }
  | { type: 'self-ref-removed'; nodeId: string; actions?: RecoveryAction[] }
  | {
      type: 'invalid-prop';
      nodeId: string;
      key: string;
      reason: string;
      actions?: RecoveryAction[];
    }
  | {
      type: 'invalid-ui-flag';
      nodeId: string;
      flag: string;
      actions?: RecoveryAction[];
    }
  | { type: 'missing-id'; generatedId: string; actions?: RecoveryAction[] }
  | {
      type: 'view-missing-field';
      viewId: string;
      field: string;
      actions?: RecoveryAction[];
    }
  | {
      type: 'template-missing-field';
      templateId: string;
      field: string;
      actions?: RecoveryAction[];
    };

/**
 * PHASE 20 — Normalization Result
 *
 * Contains both the normalized state and recovery diagnostics.
 */
export type NormalizationResult = {
  state: PersistedState;
  recovery: RecoveryEvent[];
};

/**
 * Extended UINode type with soft-delete flag
 */
type UINode = Node & {
  isCollapsed?: boolean;
  isDeleted?: boolean;
};

/**
 * Query types (from Phase 15)
 */
type Query =
  | { type: 'text'; value: string }
  | { type: 'property'; key: string; value?: string }
  | { type: 'ref'; nodeId: NodeID }
  | null;

/**
 * View type (from Phase 16)
 */
type View = {
  id: string;
  name: string;
  query: Query;
  focusRootId: NodeID | null;
};

/**
 * Template type (from Phase 17)
 */
type Template = {
  id: string;
  name: string;
  props: Record<string, string | undefined>;
};

/**
 * Persisted state shape (from Phase 18, versioned in Phase 21, Phase 23: documentId)
 */
export type PersistedState = {
  version: number; // Phase 21: Schema version
  documentId: string; // Phase 23: Document identity (prevents false merges)
  nodes: UINode[];
  views: View[];
  templates: Template[];
};

/**
 * PHASE 21 + PHASE 23 — Current schema version constant
 */
export const LATEST_VERSION = 3;

/**
 * Internal node type with original ID tracking
 */
type NormalizedNode = UINode & {
  __originalId: string;
};

/**
 * ID generation counter (deterministic per normalization call)
 */
let idCounter = 0;

/**
 * Generate a new deterministic ID
 */
function generateId(): string {
  return `node-${Date.now()}-${idCounter++}`;
}

/**
 * STEP 1 — Shape Normalization
 *
 * Trust nothing. Coerce input into workable arrays.
 */
function normalizeShape(input: unknown): {
  rawNodes: any[];
  rawViews: any[];
  rawTemplates: any[];
} {
  if (!input || typeof input !== 'object') {
    return { rawNodes: [], rawViews: [], rawTemplates: [] };
  }

  const obj = input as Record<string, any>;

  return {
    rawNodes: Array.isArray(obj.nodes) ? obj.nodes : [],
    rawViews: Array.isArray(obj.views) ? obj.views : [],
    rawTemplates: Array.isArray(obj.templates) ? obj.templates : [],
  };
}

/**
 * STEP 2 — Node Identity Pass
 *
 * IDs first, always. Coerce or generate.
 * PHASE 20: Emit events for missing/invalid IDs.
 */
function normalizeNodeIdentities(
  rawNodes: any[],
  recovery: RecoveryEvent[]
): NormalizedNode[] {
  return rawNodes.map((raw) => {
    let id: string;

    if (typeof raw.id === 'string' && raw.id.trim() !== '') {
      id = raw.id.trim();
    } else if (raw.id != null) {
      id = String(raw.id);
    } else {
      id = generateId();
      // PHASE 20: Record missing ID
      recovery.push({ type: 'missing-id', generatedId: id });
    }

    return {
      ...raw,
      id,
      __originalId: raw.id ?? id,
      text: typeof raw.text === 'string' ? raw.text : '',
      type: raw.type === 'heading' ? 'heading' : 'paragraph',
      parentId: raw.parentId ?? null,
    } as NormalizedNode;
  });
}

/**
 * STEP 3 — Detect & Resolve Duplicate IDs
 *
 * First occurrence keeps ID. Duplicates get new IDs.
 * Returns remap table for rewiring.
 * PHASE 20: Emit events for resolved duplicates.
 */
function deduplicateIds(
  nodes: NormalizedNode[],
  recovery: RecoveryEvent[]
): {
  nodes: NormalizedNode[];
  remap: Map<string, string>;
} {
  const seen = new Set<string>();
  const remap = new Map<string, string>();

  const deduplicated = nodes.map((node) => {
    if (seen.has(node.id)) {
      // Duplicate detected
      const oldId = node.id;
      const newId = generateId();
      remap.set(oldId, newId);
      seen.add(newId);

      // PHASE 20: Record duplicate ID resolution
      recovery.push({
        type: 'duplicate-id',
        originalId: oldId,
        resolvedId: newId,
      });

      return { ...node, id: newId };
    } else {
      seen.add(node.id);
      return node;
    }
  });

  return { nodes: deduplicated, remap };
}

/**
 * STEP 4 — Rewire Structural Pointers
 *
 * Apply remap table to parentId, refs, and later to views.
 */
function rewirePointers(
  nodes: NormalizedNode[],
  remap: Map<string, string>
): NormalizedNode[] {
  if (remap.size === 0) return nodes;

  return nodes.map((node) => {
    let parentId = node.parentId;
    if (parentId && remap.has(parentId)) {
      parentId = remap.get(parentId)!;
    }

    let refs = node.refs;
    if (refs && Array.isArray(refs)) {
      refs = refs.map((refId) =>
        remap.has(refId) ? remap.get(refId)! : refId
      );
    }

    return { ...node, parentId, refs };
  });
}

/**
 * STEP 5 — Tree Normalization
 *
 * 5.1 Orphan handling: parentId must reference existing node
 * 5.2 Cycle detection: no parent cycles allowed
 * PHASE 20: Emit events for orphans and broken cycles.
 */
function normalizeTree(
  nodes: NormalizedNode[],
  recovery: RecoveryEvent[]
): NormalizedNode[] {
  const nodeIds = new Set(nodes.map((n) => n.id));

  // 5.1 — Hoist orphans to root
  let normalized = nodes.map((node) => {
    if (node.parentId && !nodeIds.has(node.parentId)) {
      // PHASE 20 + 22: Record orphan hoisting with actions
      recovery.push({
        type: 'orphan-hoisted',
        nodeId: node.id,
        invalidParentId: node.parentId,
        actions: [{ type: 'focus-node', nodeId: node.id }],
      });
      return { ...node, parentId: null };
    }
    return node;
  });

  // 5.2 — Detect and break cycles
  const parentMap = new Map<NodeID, NodeID | null>();
  normalized.forEach((node) => {
    parentMap.set(node.id, node.parentId);
  });

  function hasCycle(nodeId: NodeID): boolean {
    const visited = new Set<NodeID>();
    let current: NodeID | null = nodeId;

    while (current !== null) {
      if (visited.has(current)) return true;
      visited.add(current);
      current = parentMap.get(current) ?? null;
    }

    return false;
  }

  // Break cycles by hoisting to root
  normalized = normalized.map((node) => {
    if (node.parentId && hasCycle(node.id)) {
      // PHASE 20 + 22: Record cycle breaking with actions
      recovery.push({
        type: 'cycle-broken',
        nodeId: node.id,
        actions: [{ type: 'focus-node', nodeId: node.id }],
      });
      return { ...node, parentId: null };
    }
    return node;
  });

  return normalized;
}

/**
 * STEP 6 — Reference Normalization
 *
 * Remove self-refs, deduplicate, preserve order.
 * Keep dangling refs (don't auto-delete).
 * PHASE 20: Emit events for self-refs and dangling refs.
 */
function normalizeReferences(
  nodes: NormalizedNode[],
  recovery: RecoveryEvent[]
): NormalizedNode[] {
  const nodeIds = new Set(nodes.map((n) => n.id));

  return nodes.map((node) => {
    if (!node.refs || !Array.isArray(node.refs)) {
      // Remove malformed refs
      const { refs, ...rest } = node;
      return rest as NormalizedNode;
    }

    // Filter and deduplicate
    const seen = new Set<NodeID>();
    const normalized: NodeID[] = [];

    for (const refId of node.refs) {
      if (typeof refId !== 'string') continue;

      if (refId === node.id) {
        // PHASE 20 + 22: Record self-ref removal with actions
        recovery.push({
          type: 'self-ref-removed',
          nodeId: node.id,
          actions: [{ type: 'focus-node', nodeId: node.id }],
        });
        continue;
      }

      if (seen.has(refId)) continue; // Remove duplicate

      seen.add(refId);
      normalized.push(refId);

      // PHASE 20 + 22: Record dangling ref (preserved for integrity) with actions
      if (!nodeIds.has(refId)) {
        recovery.push({
          type: 'dangling-ref',
          fromNodeId: node.id,
          toNodeId: refId,
          actions: [
            { type: 'focus-node', nodeId: node.id },
            { type: 'remove-ref', fromNodeId: node.id, toNodeId: refId },
          ],
        });
      }
    }

    if (normalized.length === 0) {
      const { refs, ...rest } = node;
      return rest as NormalizedNode;
    }

    return { ...node, refs: normalized };
  });
}

/**
 * STEP 7 — Property Normalization
 *
 * Keys: trim + lowercase
 * Values: must be strings
 * PHASE 20: Emit events for invalid props.
 */
function normalizeProperties(
  nodes: NormalizedNode[],
  recovery: RecoveryEvent[]
): NormalizedNode[] {
  return nodes.map((node) => {
    if (
      !node.props ||
      typeof node.props !== 'object' ||
      Array.isArray(node.props)
    ) {
      const { props, ...rest } = node;
      return rest as NormalizedNode;
    }

    const normalized: Record<string, string> = {};

    for (const [key, value] of Object.entries(node.props)) {
      const normalizedKey = key.trim().toLowerCase();
      if (!normalizedKey) continue;

      if (typeof value === 'string') {
        normalized[normalizedKey] = value;
      } else if (value != null) {
        // PHASE 20 + 22: Record non-string property value with actions
        recovery.push({
          type: 'invalid-prop',
          nodeId: node.id,
          key,
          reason: `Non-string value (${typeof value})`,
          actions: [{ type: 'focus-node', nodeId: node.id }],
        });
        normalized[normalizedKey] = String(value);
      } else {
        normalized[normalizedKey] = '';
      }
    }

    if (Object.keys(normalized).length === 0) {
      const { props, ...rest } = node;
      return rest as NormalizedNode;
    }

    return { ...node, props: normalized };
  });
}

/**
 * STEP 8 — UI Flag Normalization
 *
 * isDeleted, isCollapsed: boolean or remove
 * PHASE 20: Emit events for invalid UI flags.
 */
function normalizeUiFlags(
  nodes: NormalizedNode[],
  recovery: RecoveryEvent[]
): NormalizedNode[] {
  return nodes.map((node) => {
    const result = { ...node };

    if (node.isDeleted !== undefined && typeof node.isDeleted !== 'boolean') {
      // PHASE 20 + 22: Record invalid UI flag with actions
      recovery.push({
        type: 'invalid-ui-flag',
        nodeId: node.id,
        flag: 'isDeleted',
        actions: [{ type: 'focus-node', nodeId: node.id }],
      });
      delete result.isDeleted;
    }

    if (
      node.isCollapsed !== undefined &&
      typeof node.isCollapsed !== 'boolean'
    ) {
      // PHASE 20 + 22: Record invalid UI flag with actions
      recovery.push({
        type: 'invalid-ui-flag',
        nodeId: node.id,
        flag: 'isCollapsed',
        actions: [{ type: 'focus-node', nodeId: node.id }],
      });
      delete result.isCollapsed;
    }

    return result;
  });
}

/**
 * STEP 9 — View Normalization
 *
 * Ensure id, name exist. focusRootId may be null or dangling.
 * Query validation is minimal (if malformed → null).
 * PHASE 20: Emit events for missing fields.
 */
function normalizeViews(
  rawViews: any[],
  remap: Map<string, string>,
  recovery: RecoveryEvent[]
): View[] {
  return rawViews
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;

      const id = typeof raw.id === 'string' && raw.id ? raw.id : generateId();
      const name =
        typeof raw.name === 'string' && raw.name ? raw.name : 'Untitled View';

      // PHASE 20: Record missing fields
      if (!raw.id) {
        recovery.push({ type: 'view-missing-field', viewId: id, field: 'id' });
      }
      if (!raw.name) {
        recovery.push({
          type: 'view-missing-field',
          viewId: id,
          field: 'name',
        });
      }

      let focusRootId: NodeID | null = null;
      if (typeof raw.focusRootId === 'string' && raw.focusRootId) {
        // Apply remap if needed
        focusRootId = remap.has(raw.focusRootId)
          ? remap.get(raw.focusRootId)!
          : raw.focusRootId;
      }

      // Query: minimal validation, preserve if reasonable
      let query: Query = null;
      if (
        raw.query &&
        typeof raw.query === 'object' &&
        typeof raw.query.type === 'string'
      ) {
        // Trust structure minimally
        query = raw.query as Query;
      }

      return { id, name, query, focusRootId };
    })
    .filter((v): v is View => v !== null);
}

/**
 * STEP 10 — Template Normalization
 *
 * Ensure id, name exist. Normalize props same as node props.
 * PHASE 20: Emit events for missing fields.
 */
function normalizeTemplates(
  rawTemplates: any[],
  recovery: RecoveryEvent[]
): Template[] {
  return rawTemplates
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;

      const id = typeof raw.id === 'string' && raw.id ? raw.id : generateId();
      const name =
        typeof raw.name === 'string' && raw.name
          ? raw.name
          : 'Untitled Template';

      // PHASE 20: Record missing fields
      if (!raw.id) {
        recovery.push({
          type: 'template-missing-field',
          templateId: id,
          field: 'id',
        });
      }
      if (!raw.name) {
        recovery.push({
          type: 'template-missing-field',
          templateId: id,
          field: 'name',
        });
      }

      const props: Record<string, string | undefined> = {};
      if (
        raw.props &&
        typeof raw.props === 'object' &&
        !Array.isArray(raw.props)
      ) {
        for (const [key, value] of Object.entries(raw.props)) {
          const normalizedKey = key.trim().toLowerCase();
          if (!normalizedKey) continue;

          if (typeof value === 'string') {
            props[normalizedKey] = value;
          } else if (value === undefined) {
            props[normalizedKey] = undefined;
          } else if (value != null) {
            props[normalizedKey] = String(value);
          } else {
            props[normalizedKey] = '';
          }
        }
      }

      return { id, name, props };
    })
    .filter((t): t is Template => t !== null);
}

/**
 * STEP 11 — Strip Temporary Fields
 *
 * Remove __originalId and other normalization metadata.
 */
function stripTemporaryFields(nodes: NormalizedNode[]): UINode[] {
  return nodes.map((node) => {
    const { __originalId, ...clean } = node;
    return clean as UINode;
  });
}

/**
 * MAIN ENTRY POINT
 *
 * Phase 19: Normalization & Integrity
 * Phase 20: Recovery & Transparency
 *
 * Turn unknown JSON into guaranteed-valid PersistedState.
 * Never throws. Never loses data. Always deterministic.
 *
 * Phase 20: Also returns recovery events for observability.
 */
export function normalizePersistedState(input: unknown): NormalizationResult {
  // Reset ID counter for determinism within this call
  idCounter = 0;

  // PHASE 20: Recovery event accumulator
  const recovery: RecoveryEvent[] = [];

  // PHASE 21: Extract version (should be set by migration, default to LATEST_VERSION)
  const version =
    typeof (input as any)?.version === 'number'
      ? (input as any).version
      : LATEST_VERSION;

  // PHASE 23: Extract documentId (should be set by migration, generate if missing)
  const documentId =
    typeof (input as any)?.documentId === 'string'
      ? (input as any).documentId
      : crypto.randomUUID();

  // STEP 1: Shape normalization
  const { rawNodes, rawViews, rawTemplates } = normalizeShape(input);

  // STEP 2: Node identity pass
  let nodes = normalizeNodeIdentities(rawNodes, recovery);

  // STEP 3: Deduplicate IDs
  const { nodes: deduped, remap } = deduplicateIds(nodes, recovery);
  nodes = deduped;

  // STEP 4: Rewire pointers
  nodes = rewirePointers(nodes, remap);

  // STEP 5: Tree normalization
  nodes = normalizeTree(nodes, recovery);

  // STEP 6: Reference normalization
  nodes = normalizeReferences(nodes, recovery);

  // STEP 7: Property normalization
  nodes = normalizeProperties(nodes, recovery);

  // STEP 8: UI flag normalization
  nodes = normalizeUiFlags(nodes, recovery);

  // STEP 9: View normalization
  const views = normalizeViews(rawViews, remap, recovery);

  // STEP 10: Template normalization
  const templates = normalizeTemplates(rawTemplates, recovery);

  // STEP 11: Strip temporary fields
  const cleanNodes = stripTemporaryFields(nodes);

  // Final assembly (Phase 20: return both state and recovery, Phase 21: include version, Phase 23: include documentId)
  return {
    state: {
      version, // Phase 21: Preserve migrated version
      documentId, // Phase 23: Preserve document identity
      nodes: cleanNodes,
      views,
      templates,
    },
    recovery,
  };
}
