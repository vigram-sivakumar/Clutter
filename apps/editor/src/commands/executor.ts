/**
 * PHASE A — COMMAND EXECUTOR
 *
 * Bridge between commands and editor state mutations.
 *
 * Rules:
 * - Commands never mutate directly
 * - Executor calls existing editor primitives
 * - All mutations flow through this layer
 * - Returns explicit success/error/noop results
 *
 * This is the enforcement point for:
 * - Undo/redo batching
 * - Sync operation application
 * - Command validation
 */

import type { Command, CommandResult, NodeRef } from './types';
import type { Node, NodeID, EditorState } from '../editor/engine';
import { getPlainText, findSegmentAtPlainTextOffset } from '../editor/engine';

/**
 * Editor Context
 *
 * The executor needs access to current state and mutation functions.
 * This is provided by the UI layer (NodeEditor).
 */
export type EditorContext = {
  // Current state (read-only for executor) - SEGMENTED ARCHITECTURE
  getState: () => {
    nodes: Node[];
    cursor: {
      nodeId: NodeID;
      segmentIndex: number;
      offset: number;
    };
  };

  // Mutation primitives (from NodeEditor)
  mutations: {
    updateNodes: (nodes: Node[]) => void;
    setActiveNode: (nodeId: NodeID, offset: number) => void;
    createNode: (
      nodeType: string,
      text: string,
      parentId?: NodeID | null,
      afterId?: NodeID | null
    ) => NodeID;
    deleteNode: (nodeId: NodeID) => void;
    indentNode: (nodeId: NodeID) => void;
    outdentNode: (nodeId: NodeID) => void;
    moveNode: (
      nodeId: NodeID,
      newParentId: NodeID | null,
      afterId: NodeID | null
    ) => void;
    setNodeProperty: (nodeId: NodeID, key: string, value: string) => void;
    deleteNodeProperty: (nodeId: NodeID, key: string) => void;
    addReference: (fromNodeId: NodeID, toNodeId: NodeID) => void;
    removeReference: (fromNodeId: NodeID, toNodeId: NodeID) => void;
    applyTemplate: (nodeId: NodeID, templateId: string) => void;
  };

  // Document operations
  documents: {
    create: (name?: string) => string;
    rename: (documentId: string, name: string) => void;
    delete: (documentId: string) => void;
    switch: (documentId: string) => void;
  };

  // System operations
  system: {
    saveNow: () => void;
    bindLocation: () => void;
    retrySave: () => void;
  };
};

/**
 * Execute a single command
 *
 * Validates, applies mutation, returns result.
 */
export function executeCommand(
  command: Command,
  context: EditorContext
): CommandResult {
  try {
    switch (command.type) {
      // ========================================
      // CATEGORY 1: NODE CONTENT COMMANDS
      // ========================================

      case 'node.insertText': {
        const { nodeId, offset, text } = command.payload;
        const state = context.getState();
        const node = state.nodes.find((n) => n.id === nodeId);

        if (!node) {
          return { status: 'error', message: `Node ${nodeId} not found` };
        }

        // SEGMENTED ARCHITECTURE: Convert plain text offset to segment cursor
        const plainText = getPlainText(node.segments);
        const cursor = findSegmentAtPlainTextOffset(node.segments, offset);
        
        // Insert text at segment cursor
        const newSegments = [...node.segments];
        const segment = newSegments[cursor.segmentIndex];
        
        if (segment && segment.type === 'text') {
          newSegments[cursor.segmentIndex] = {
            type: 'text',
            text: segment.text.slice(0, cursor.offset) + text + segment.text.slice(cursor.offset)
          };
        }

        const updatedNodes = state.nodes.map((n) =>
          n.id === nodeId ? { ...n, segments: newSegments } : n
        );

        context.mutations.updateNodes(updatedNodes);
        context.mutations.setActiveNode(nodeId, offset + text.length);

        return { status: 'success' };
      }

      case 'node.deleteText': {
        const { nodeId, from, to } = command.payload;
        const state = context.getState();
        const node = state.nodes.find((n) => n.id === nodeId);

        if (!node) {
          return { status: 'error', message: `Node ${nodeId} not found` };
        }

        if (from === to) {
          return { status: 'noop', reason: 'Empty range' };
        }

        // SEGMENTED ARCHITECTURE: Delete range in plain text
        const plainText = getPlainText(node.segments);
        const newPlainText = plainText.slice(0, from) + plainText.slice(to);
        
        // Rebuild segments with updated text (simplified - loses inline elements)
        const newSegments = newPlainText ? [{ type: 'text' as const, text: newPlainText }] : [];

        const updatedNodes = state.nodes.map((n) =>
          n.id === nodeId ? { ...n, segments: newSegments } : n
        );

        context.mutations.updateNodes(updatedNodes);
        context.mutations.setActiveNode(nodeId, from);

        return { status: 'success' };
      }

      case 'node.replaceText': {
        const { nodeId, from, to, text } = command.payload;
        const state = context.getState();
        const node = state.nodes.find((n) => n.id === nodeId);

        if (!node) {
          return { status: 'error', message: `Node ${nodeId} not found` };
        }

        // SEGMENTED ARCHITECTURE: Replace range in plain text
        const plainText = getPlainText(node.segments);
        const newPlainText = plainText.slice(0, from) + text + plainText.slice(to);
        
        // Rebuild segments with updated text (simplified - loses inline elements)
        const newSegments = newPlainText ? [{ type: 'text' as const, text: newPlainText }] : [];

        const updatedNodes = state.nodes.map((n) =>
          n.id === nodeId ? { ...n, segments: newSegments } : n
        );

        context.mutations.updateNodes(updatedNodes);
        context.mutations.setActiveNode(nodeId, from + text.length);

        return { status: 'success' };
      }

      // ========================================
      // CATEGORY 2: STRUCTURE COMMANDS
      // ========================================

      case 'node.create': {
        const { parentId, afterId, nodeType, text } = command.payload;
        const type = nodeType || 'paragraph';
        const content = text || '';

        const newNodeId = context.mutations.createNode(
          type,
          content,
          parentId,
          afterId
        );

        return { status: 'success' };
      }

      case 'node.delete': {
        const { nodeId } = command.payload;
        context.mutations.deleteNode(nodeId);
        return { status: 'success' };
      }

      case 'node.indent': {
        const { nodeId } = command.payload;
        context.mutations.indentNode(nodeId);
        return { status: 'success' };
      }

      case 'node.outdent': {
        const { nodeId } = command.payload;
        context.mutations.outdentNode(nodeId);
        return { status: 'success' };
      }

      case 'node.move': {
        const { nodeId, newParentId, afterId } = command.payload;
        context.mutations.moveNode(nodeId, newParentId, afterId);
        return { status: 'success' };
      }

      // ========================================
      // CATEGORY 3: REFERENCE COMMANDS
      // ========================================

      case 'ref.add': {
        const { fromNodeId, to } = command.payload;

        if (to.type === 'external') {
          // External refs not yet implemented in UI
          return {
            status: 'error',
            message: 'External references not yet supported',
          };
        }

        context.mutations.addReference(fromNodeId, to.nodeId);
        return { status: 'success' };
      }

      case 'ref.remove': {
        const { fromNodeId, to } = command.payload;

        if (to.type === 'external') {
          return {
            status: 'error',
            message: 'External references not yet supported',
          };
        }

        context.mutations.removeReference(fromNodeId, to.nodeId);
        return { status: 'success' };
      }

      // ========================================
      // CATEGORY 4: PROPERTY COMMANDS
      // ========================================

      case 'prop.set': {
        const { nodeId, key, value } = command.payload;
        context.mutations.setNodeProperty(nodeId, key, value);
        return { status: 'success' };
      }

      case 'prop.remove': {
        const { nodeId, key } = command.payload;
        context.mutations.deleteNodeProperty(nodeId, key);
        return { status: 'success' };
      }

      // ========================================
      // CATEGORY 5: TEMPLATE COMMANDS
      // ========================================

      case 'template.apply': {
        const { nodeId, templateId } = command.payload;
        context.mutations.applyTemplate(nodeId, templateId);
        return { status: 'success' };
      }

      // ========================================
      // CATEGORY 6: DOCUMENT COMMANDS
      // ========================================

      case 'document.create': {
        const { name } = command.payload;
        context.documents.create(name);
        return { status: 'success' };
      }

      case 'document.rename': {
        const { documentId, name } = command.payload;
        context.documents.rename(documentId, name);
        return { status: 'success' };
      }

      case 'document.delete': {
        const { documentId } = command.payload;
        context.documents.delete(documentId);
        return { status: 'success' };
      }

      case 'document.switch': {
        const { documentId } = command.payload;
        context.documents.switch(documentId);
        return { status: 'success' };
      }

      // ========================================
      // CATEGORY 7: WORKSPACE COMMANDS
      // ========================================

      case 'workspace.create':
      case 'workspace.switch':
      case 'workspace.duplicateExternalNode': {
        // Workspace operations not yet implemented
        return {
          status: 'error',
          message: 'Workspace commands not yet implemented',
        };
      }

      // ========================================
      // CATEGORY 8: SYSTEM COMMANDS
      // ========================================

      case 'system.saveNow': {
        context.system.saveNow();
        return { status: 'success' };
      }

      case 'system.bindLocation': {
        context.system.bindLocation();
        return { status: 'success' };
      }

      case 'system.retrySave': {
        context.system.retrySave();
        return { status: 'success' };
      }

      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = command;
        return {
          status: 'error',
          message: `Unknown command type: ${(_exhaustive as Command).type}`,
        };
      }
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Execute a batch of commands
 *
 * All commands in a batch are applied as a single undo unit.
 */
export function executeCommandBatch(
  commands: Command[],
  context: EditorContext
): CommandResult {
  const results: CommandResult[] = [];

  for (const command of commands) {
    const result = executeCommand(command, context);
    results.push(result);

    // Stop on first error
    if (result.status === 'error') {
      return result;
    }
  }

  // All succeeded
  return { status: 'success' };
}
