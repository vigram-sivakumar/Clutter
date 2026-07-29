/**
 * E2E tests for editor keyboard and mouse interactions.
 * Each test navigates to a fresh page, so each starts with one empty node.
 *
 * DOM structure recap:
 *   .clutter-document-body              — editor root (direct children are top-level nodes)
 *     .clutter-node[data-node-id]       — each node wrapper
 *       .clutter-node__inner
 *         .clutter-node__content        — contenteditable
 *           span > (text node)
 *       .clutter-node__children         — present only when node has children
 *         .clutter-node[data-node-id]   — child node wrappers (same structure)
 */
export {};
