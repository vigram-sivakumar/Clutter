/**
 * PHASE A — COMMAND MODEL
 *
 * Canonical command surface for all editor mutations.
 *
 * Rules:
 * - If it changes data, it must be a command
 * - If it's not a command, it must not mutate state
 * - Commands are the only legal way to change editor state
 *
 * This is the stable target for:
 * - Slash commands
 * - @mentions
 * - #hashtags
 * - Buttons
 * - Menus
 * - Keyboard shortcuts
 * - Undo/redo
 * - Sync operations
 */

import type { NodeID } from '../engine/NodeKernel';

/**
 * CATEGORY 1 — NODE CONTENT COMMANDS
 *
 * Granular text operations for precise undo.
 */
export type NodeContentCommand =
  | {
      type: 'node.insertText';
      payload: {
        nodeId: NodeID;
        offset: number;
        text: string;
      };
    }
  | {
      type: 'node.deleteText';
      payload: {
        nodeId: NodeID;
        from: number;
        to: number;
      };
    }
  | {
      type: 'node.replaceText';
      payload: {
        nodeId: NodeID;
        from: number;
        to: number;
        text: string;
      };
    };

/**
 * CATEGORY 2 — STRUCTURE (TREE) COMMANDS
 *
 * Parent/child relationships.
 */
export type StructureCommand =
  | {
      type: 'node.create';
      payload: {
        parentId: NodeID | null;
        afterId: NodeID | null;
        nodeType?: string; // 'paragraph', 'heading', etc.
        text?: string;
      };
    }
  | {
      type: 'node.delete';
      payload: {
        nodeId: NodeID;
      };
    }
  | {
      type: 'node.indent';
      payload: {
        nodeId: NodeID;
      };
    }
  | {
      type: 'node.outdent';
      payload: {
        nodeId: NodeID;
      };
    }
  | {
      type: 'node.move';
      payload: {
        nodeId: NodeID;
        newParentId: NodeID | null;
        afterId: NodeID | null;
      };
    };

/**
 * CATEGORY 3 — REFERENCE (GRAPH) COMMANDS
 *
 * Knowledge graph relationships.
 * Backlinks remain derived, never commanded.
 */

/**
 * Node reference type (supports local + external refs)
 */
export type NodeRef =
  | {
      type: 'local';
      nodeId: NodeID;
    }
  | {
      type: 'external';
      workspaceId: string;
      documentId: string;
      nodeId: NodeID;
    };

export type ReferenceCommand =
  | {
      type: 'ref.add';
      payload: {
        fromNodeId: NodeID;
        to: NodeRef;
      };
    }
  | {
      type: 'ref.remove';
      payload: {
        fromNodeId: NodeID;
        to: NodeRef;
      };
    };

/**
 * CATEGORY 4 — PROPERTIES & METADATA COMMANDS
 *
 * Powers #hashtags, queries, templates.
 * No schema enforcement (UI-level concern).
 */
export type PropertyCommand =
  | {
      type: 'prop.set';
      payload: {
        nodeId: NodeID;
        key: string;
        value: string;
      };
    }
  | {
      type: 'prop.remove';
      payload: {
        nodeId: NodeID;
        key: string;
      };
    };

/**
 * CATEGORY 5 — TEMPLATE COMMANDS
 *
 * Templates are applied, never enforced.
 * No template mutation, inheritance, or locking (UI concerns).
 */
export type TemplateCommand = {
  type: 'template.apply';
  payload: {
    nodeId: NodeID;
    templateId: string;
  };
};

/**
 * CATEGORY 6 — DOCUMENT COMMANDS
 *
 * Multi-document navigation and lifecycle.
 */
export type DocumentCommand =
  | {
      type: 'document.create';
      payload: {
        name?: string;
      };
    }
  | {
      type: 'document.rename';
      payload: {
        documentId: string;
        name: string;
      };
    }
  | {
      type: 'document.delete';
      payload: {
        documentId: string;
      };
    }
  | {
      type: 'document.switch';
      payload: {
        documentId: string;
      };
    };

/**
 * CATEGORY 7 — WORKSPACE COMMANDS
 *
 * Cross-workspace operations (UI comes later).
 */
export type WorkspaceCommand =
  | {
      type: 'workspace.create';
      payload: {
        name: string;
      };
    }
  | {
      type: 'workspace.switch';
      payload: {
        workspaceId: string;
      };
    }
  | {
      type: 'workspace.duplicateExternalNode';
      payload: {
        nodeRef: NodeRef;
      };
    };

/**
 * CATEGORY 8 — PERSISTENCE & SYSTEM COMMANDS
 *
 * Explicit user intent (not autosave).
 * These do not mutate content but represent system operations.
 */
export type SystemCommand =
  | {
      type: 'system.saveNow';
    }
  | {
      type: 'system.bindLocation';
    }
  | {
      type: 'system.retrySave';
    };

/**
 * UNIFIED COMMAND TYPE
 *
 * The closed set of all possible commands.
 */
export type Command =
  | NodeContentCommand
  | StructureCommand
  | ReferenceCommand
  | PropertyCommand
  | TemplateCommand
  | DocumentCommand
  | WorkspaceCommand
  | SystemCommand;

/**
 * Command result type
 *
 * Commands can succeed, fail, or be no-ops.
 */
export type CommandResult =
  | { status: 'success' }
  | { status: 'error'; message: string }
  | { status: 'noop'; reason: string };

/**
 * Command metadata for undo/redo and sync
 */
export type CommandMetadata = {
  timestamp: number;
  source: 'user' | 'sync' | 'system';
  batchId?: string; // For grouping related commands
};

/**
 * Wrapped command with metadata
 */
export type CommandWithMetadata = {
  command: Command;
  metadata: CommandMetadata;
};
