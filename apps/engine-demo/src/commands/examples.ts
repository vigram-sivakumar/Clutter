/**
 * PHASE A — COMMAND MODEL EXAMPLES
 *
 * Demonstrations of how commands replace direct mutations.
 */

import type { Command } from './types';

/**
 * EXAMPLE 1: Creating a new node
 *
 * Before (direct mutation):
 * ```
 * const node = createNode('paragraph', 'Hello');
 * insertNodeAfter(nodes, node, previousNodeId);
 * ```
 *
 * After (command):
 */
export const createNodeCommand: Command = {
  type: 'node.create',
  payload: {
    parentId: null,
    afterId: 'previous-node-id',
    nodeType: 'paragraph',
    text: 'Hello',
  },
};

/**
 * EXAMPLE 2: Adding a hashtag
 *
 * Before (direct mutation):
 * ```
 * setNodeProperty(nodeId, 'status', 'done');
 * ```
 *
 * After (command):
 */
export const addHashtagCommand: Command = {
  type: 'prop.set',
  payload: {
    nodeId: 'node-123',
    key: 'status',
    value: 'done',
  },
};

/**
 * EXAMPLE 3: @mention creates reference
 *
 * User types: @TaskNode
 * Parser detects mention → generates command:
 */
export const mentionCommand: Command = {
  type: 'ref.add',
  payload: {
    fromNodeId: 'current-node-id',
    to: {
      type: 'local',
      nodeId: 'task-node-id',
    },
  },
};

/**
 * EXAMPLE 4: Slash command to indent
 *
 * User types: /indent
 * Parser generates:
 */
export const slashIndentCommand: Command = {
  type: 'node.indent',
  payload: {
    nodeId: 'current-node-id',
  },
};

/**
 * EXAMPLE 5: Batch commands for complex operation
 *
 * User action: "Convert to task"
 * Multiple commands batched together:
 */
export const convertToTaskBatch: Command[] = [
  // Set type property
  {
    type: 'prop.set',
    payload: {
      nodeId: 'node-123',
      key: 'type',
      value: 'task',
    },
  },
  // Set status property
  {
    type: 'prop.set',
    payload: {
      nodeId: 'node-123',
      key: 'status',
      value: 'todo',
    },
  },
  // Set priority property
  {
    type: 'prop.set',
    payload: {
      nodeId: 'node-123',
      key: 'priority',
      value: 'normal',
    },
  },
];

/**
 * EXAMPLE 6: Text editing
 *
 * User types "Hello" at cursor position 5:
 */
export const typeTextCommand: Command = {
  type: 'node.insertText',
  payload: {
    nodeId: 'current-node-id',
    offset: 5,
    text: 'Hello',
  },
};

/**
 * EXAMPLE 7: Backspace deletion
 *
 * User presses backspace at position 10:
 */
export const backspaceCommand: Command = {
  type: 'node.deleteText',
  payload: {
    nodeId: 'current-node-id',
    from: 9, // Delete character before cursor
    to: 10,
  },
};

/**
 * EXAMPLE 8: Template application
 *
 * User applies "Meeting Notes" template:
 */
export const applyTemplateCommand: Command = {
  type: 'template.apply',
  payload: {
    nodeId: 'current-node-id',
    templateId: 'meeting-notes-template-id',
  },
};

/**
 * EXAMPLE 9: External reference (cross-workspace)
 *
 * User references a node from another workspace:
 */
export const externalRefCommand: Command = {
  type: 'ref.add',
  payload: {
    fromNodeId: 'current-node-id',
    to: {
      type: 'external',
      workspaceId: 'workspace-abc',
      documentId: 'document-xyz',
      nodeId: 'node-789',
    },
  },
};

/**
 * EXAMPLE 10: Document operations
 *
 * User creates new document:
 */
export const createDocumentCommand: Command = {
  type: 'document.create',
  payload: {
    name: 'Project Notes',
  },
};

/**
 * How to execute commands:
 *
 * ```typescript
 * import { executeCommand, executeCommandBatch } from './commands';
 *
 * // Single command
 * const result = executeCommand(createNodeCommand, editorContext);
 *
 * // Batch of commands (single undo unit)
 * const result = executeCommandBatch(convertToTaskBatch, editorContext);
 *
 * // Check result
 * if (result.status === 'success') {
 *   console.log('Command executed successfully');
 * } else if (result.status === 'error') {
 *   console.error('Command failed:', result.message);
 * } else {
 *   console.log('No-op:', result.reason);
 * }
 * ```
 */
