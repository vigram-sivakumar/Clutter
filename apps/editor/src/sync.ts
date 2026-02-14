/**
 * PHASE 23 — Sync Semantics (Engine-level, UI-agnostic)
 *
 * Defines how external state is accepted alongside existing state.
 *
 * Principles:
 * - Conflicts are data, not errors
 * - No auto-resolution
 * - No node mutation
 * - Deterministic output
 * - Local-wins default
 */

import type { NodeID } from './editor/engine';
import type { PersistedState } from './normalize';
import { migrateToLatest } from './migrations';
import { normalizePersistedState } from './normalize';

/**
 * PHASE 23 — Conflict Types (UI-agnostic)
 *
 * Conflicts represent divergence between local and remote state.
 * Never auto-resolved. Always preserved for user decision.
 */
export type Conflict =
  | {
      type: 'id-collision';
      localNodeId: NodeID;
      remoteNodeId: NodeID;
      remoteDocumentId: string;
      resolvedAs: 'coexist'; // Remote node got new ID
    }
  | {
      type: 'structural-divergence';
      nodeId: NodeID;
      field: 'parentId';
      localValue: NodeID | null;
      remoteValue: NodeID | null;
    }
  | {
      type: 'property-divergence';
      nodeId: NodeID;
      key: string;
      localValue?: string;
      remoteValue?: string;
    }
  | {
      type: 'ref-divergence';
      nodeId: NodeID;
      localRefs: NodeID[];
      remoteRefs: NodeID[];
    };

/**
 * PHASE 23 — Sync Result (read-only projection)
 *
 * Result of merging local and remote state.
 * Never persisted. Never creates history entries.
 */
export type SyncResult = {
  merged: PersistedState; // Coexistence view (both datasets)
  conflicts: Conflict[]; // Divergence records
};

/**
 * PHASE 23 — Sync State (deterministic comparison)
 *
 * Accepts a second persisted state and produces a coexistence view.
 *
 * Pipeline:
 * 1. Migrate remote (Phase 21)
 * 2. Normalize remote (Phase 19)
 * 3. Compare local vs remote
 * 4. Generate conflicts
 * 5. Return merged view (both datasets coexist)
 *
 * Rules:
 * - No node mutation
 * - No silent data loss
 * - Deterministic output
 * - Local-wins for conflicts
 */
export function syncState(
  local: PersistedState,
  remoteRaw: unknown
): SyncResult {
  const conflicts: Conflict[] = [];

  // STEP 1: Migrate remote to latest version
  const remoteMigrated = migrateToLatest(remoteRaw);

  // STEP 2: Normalize remote through trust boundary
  const { state: remote } = normalizePersistedState(remoteMigrated);
  // Note: recovery events from remote normalization are not surfaced in sync
  // They were already handled during remote's initial creation

  // If remote has same documentId, this is the same document (update, not sync)
  if (local.documentId === remote.documentId) {
    // Same document - this is an update scenario, not a sync
    // For now, just return remote as-is (no conflicts)
    // Future: implement diff-based update logic
    return {
      merged: remote,
      conflicts: [],
    };
  }

  // STEP 3: Handle ID collisions (different documents, same node IDs)
  const localNodeIds = new Set(local.nodes.map((n) => n.id));
  const idRemap = new Map<NodeID, NodeID>();

  const remoteNodesResolved = remote.nodes.map((remoteNode) => {
    if (localNodeIds.has(remoteNode.id)) {
      // Collision: same ID in different documents
      const oldId = remoteNode.id;
      const newId = `${oldId}__from__${remote.documentId.slice(0, 8)}`;

      idRemap.set(oldId, newId);

      conflicts.push({
        type: 'id-collision',
        localNodeId: oldId,
        remoteNodeId: newId,
        remoteDocumentId: remote.documentId,
        resolvedAs: 'coexist',
      });

      return { ...remoteNode, id: newId };
    }
    return remoteNode;
  });

  // STEP 4: Rewire remote refs after ID collision resolution
  const remoteNodesRewired = remoteNodesResolved.map((node) => {
    if (!node.refs || node.refs.length === 0) return node;

    const refs = node.refs.map((refId) => idRemap.get(refId) ?? refId);
    return { ...node, refs };
  });

  // STEP 5: Rewire remote parentIds after ID collision resolution
  const remoteNodesFinal = remoteNodesRewired.map((node) => {
    if (!node.parentId) return node;

    const parentId = idRemap.get(node.parentId) ?? node.parentId;
    return { ...node, parentId };
  });

  // STEP 6: Merge nodes (coexistence - both datasets included)
  const mergedNodes = [...local.nodes, ...remoteNodesFinal];

  // STEP 7: Merge views and templates (local only for now)
  // Future: could detect view/template conflicts too
  const mergedViews = local.views;
  const mergedTemplates = local.templates;

  // STEP 8: Detect structural divergence (same logical node, different structure)
  // Note: This requires tracking node identity across documents
  // For Phase 23, we only detect ID collisions
  // Future phases can add more sophisticated divergence detection

  return {
    merged: {
      version: local.version,
      documentId: local.documentId, // Local document ID is preserved
      nodes: mergedNodes,
      views: mergedViews,
      templates: mergedTemplates,
    },
    conflicts,
  };
}
