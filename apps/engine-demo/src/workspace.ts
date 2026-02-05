/**
 * PHASE 24 — Workspace Model (FINAL ENGINE LAYER)
 *
 * Defines workspace identity and cross-workspace reference semantics.
 *
 * Principles:
 * - Workspace is a trust boundary, not a folder
 * - Full node identity: (workspaceId, documentId, nodeId)
 * - Local refs are fast, external refs are best-effort
 * - No auto-fetch, no auto-sync, no magic
 * - Duplication is explicit copy with clear semantics
 */

import type { NodeID, Node } from './engine/NodeKernel';
import type { PersistedState } from './normalize';

/**
 * PHASE 24 — Workspace Type
 *
 * Top-level identity container.
 * Owns documents, node identities, and history.
 */
export type Workspace = {
  workspaceId: string; // Globally unique
  name: string;
  documents: PersistedState[];
};

/**
 * PHASE 24 — Node Reference Types
 *
 * Local: same workspace + document (fast, assumed valid)
 * External: different workspace or document (best-effort, may be missing)
 */
export type NodeRef =
  | { type: 'local'; nodeId: NodeID }
  | {
      type: 'external';
      workspaceId: string;
      documentId: string;
      nodeId: NodeID;
    };

/**
 * PHASE 24 — Full Node Identity
 *
 * Complete address of a node in the system.
 * (workspaceId, documentId, nodeId) is globally unique.
 */
export type NodeIdentity = {
  workspaceId: string;
  documentId: string;
  nodeId: NodeID;
};

/**
 * PHASE 24 — Workspace Context
 *
 * Current workspace and document context for ref resolution.
 */
export type WorkspaceContext = {
  workspaceId: string;
  documentId: string;
};

/**
 * PHASE 24 — Resolve Node Reference
 *
 * Convert NodeRef to full identity given current context.
 * Local refs inherit workspace/document from context.
 */
export function resolveNodeRef(
  ref: NodeRef,
  context: WorkspaceContext
): NodeIdentity {
  if (ref.type === 'local') {
    return {
      workspaceId: context.workspaceId,
      documentId: context.documentId,
      nodeId: ref.nodeId,
    };
  }

  return {
    workspaceId: ref.workspaceId,
    documentId: ref.documentId,
    nodeId: ref.nodeId,
  };
}

/**
 * PHASE 24 — Create Node Reference
 *
 * Create appropriate ref type based on identity comparison.
 * Same workspace+document → local ref (fast)
 * Different → external ref (explicit)
 */
export function createNodeRef(
  targetIdentity: NodeIdentity,
  context: WorkspaceContext
): NodeRef {
  if (
    targetIdentity.workspaceId === context.workspaceId &&
    targetIdentity.documentId === context.documentId
  ) {
    return { type: 'local', nodeId: targetIdentity.nodeId };
  }

  return {
    type: 'external',
    workspaceId: targetIdentity.workspaceId,
    documentId: targetIdentity.documentId,
    nodeId: targetIdentity.nodeId,
  };
}

/**
 * PHASE 24 — Duplicate External Node
 *
 * Copy external node into current workspace/document.
 * Creates new local node with new identity.
 *
 * This is NOT sync. This is NOT merge.
 * This is explicit copy with intent.
 *
 * Rules:
 * - New nodeId generated
 * - Text/props/type copied
 * - Refs NOT copied (avoid transitive explosion)
 * - Origin metadata optional (UI choice)
 * - Never auto-run
 */
export function duplicateExternalNode(
  externalNode: Node,
  sourceIdentity: NodeIdentity,
  generateId: () => string
): {
  node: Node;
  originMetadata: {
    sourceWorkspaceId: string;
    sourceDocumentId: string;
    sourceNodeId: NodeID;
    duplicatedAt: number;
  };
} {
  // Generate new local identity
  const newId = generateId();

  // Create new node with copied content
  const node: Node = {
    id: newId,
    type: externalNode.type,
    text: externalNode.text,
    parentId: null, // Always starts at root in target document
    props: externalNode.props ? { ...externalNode.props } : undefined,
    // refs NOT copied (intentional - prevents transitive explosion)
  };

  // Origin metadata (read-only, never affects behavior)
  const originMetadata = {
    sourceWorkspaceId: sourceIdentity.workspaceId,
    sourceDocumentId: sourceIdentity.documentId,
    sourceNodeId: sourceIdentity.nodeId,
    duplicatedAt: Date.now(),
  };

  return { node, originMetadata };
}

/**
 * PHASE 24 — Workspace Invariants (validation helpers)
 *
 * Enforce workspace-level guarantees.
 */

/**
 * Check if documentId is unique within workspace
 */
export function hasUniqueDocumentIds(workspace: Workspace): boolean {
  const docIds = workspace.documents.map((doc) => doc.documentId);
  return docIds.length === new Set(docIds).size;
}

/**
 * Check if all document versions are current
 */
export function allDocumentsUpToDate(
  workspace: Workspace,
  latestVersion: number
): boolean {
  return workspace.documents.every((doc) => doc.version === latestVersion);
}
