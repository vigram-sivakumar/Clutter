/**
 * Tag Utilities
 * Shared functions for adding tags to blocks
 */

import { EditorState, Transaction, TextSelection } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';

// ============================================
// HASHTAG DETECTION & PARSING
// ============================================

/** 
 * Shared regex for hashtag matching
 * Matches # followed by any text until cursor (allows spaces, prevents leading/trailing spaces)
 * Examples: #task, #task name, #work project 2024
 */
export const HASHTAG_REGEX = /#(\S+(?:\s+\S+)*)$/;

/**
 * Check if a tag already exists in a list of tags (case-insensitive)
 */
export function tagExists(tags: string[], tagName: string): boolean {
  return tags.some((t: string) => t.toLowerCase() === tagName.toLowerCase());
}

// ============================================
// TRANSACTION-BASED TAG OPERATIONS
// ============================================

/**
 * Add a tag to a block node's attributes (Transaction-based)
 * Only adds if tag doesn't already exist (case-insensitive check)
 * 
 * @param tr - ProseMirror transaction
 * @param blockPos - Position of the block node
 * @param blockAttrs - Current block attributes
 * @param tagName - Tag name to add
 * @returns Modified transaction
 */
export function addTagToBlockFromTransaction(
  tr: Transaction,
  blockPos: number,
  blockAttrs: any,
  tagName: string
): Transaction {
  const existingTags = blockAttrs.tags || [];
  
  if (!tagExists(existingTags, tagName)) {
    tr.setNodeMarkup(blockPos, null, {
      ...blockAttrs,
      tags: [...existingTags, tagName],
    });
  }
  
  return tr;
}

/**
 * Delete text range and position cursor at the start
 * 
 * @param tr - ProseMirror transaction
 * @param from - Start position
 * @param to - End position
 * @returns Modified transaction with cursor positioned at 'from'
 */
export function deleteTextAndPositionCursor(
  tr: Transaction,
  from: number,
  to: number
): Transaction {
  tr.delete(from, to);
  tr.setSelection(TextSelection.create(tr.doc, from));
  return tr;
}

/**
 * Complete tag insertion workflow:
 * 1. Delete the #tagname text
 * 2. Add tag to block attributes (if not exists)
 * 3. Position cursor where the tag was
 * 
 * @param tr - ProseMirror transaction
 * @param hashtagPos - Position of the '#' character
 * @param cursorPos - Current cursor position (end of hashtag)
 * @param blockPos - Position of the parent block node
 * @param blockAttrs - Current block attributes
 * @param tagName - Tag name to add
 * @returns Modified transaction
 */
export function insertTag(
  tr: Transaction,
  hashtagPos: number,
  cursorPos: number,
  blockPos: number,
  blockAttrs: any,
  tagName: string
): Transaction {
  // Delete the #tagname text
  deleteTextAndPositionCursor(tr, hashtagPos, cursorPos);
  
  // Add tag to block (if not exists)
  addTagToBlockFromTransaction(tr, blockPos, blockAttrs, tagName);
  
  return tr;
}

// ============================================
// STATE-BASED TAG OPERATIONS (Legacy)
// ============================================

/**
 * Add a tag to a block node
 * @param state - Editor state
 * @param tagName - Tag name to add
 * @param blockDepth - Depth of the block node
 * @returns Transaction or null if tag already exists
 */
export function addTagToBlock(
  state: EditorState,
  tagName: string,
  blockDepth: number
): Transaction | null {
  const { $from } = state.selection;
  
  // Get the block node at the specified depth
  const blockNode = $from.node(blockDepth);
  const existingTags = blockNode.attrs.tags || [];
  
  // Check if tag already exists (case-insensitive)
  const tagExists = existingTags.some(
    (t: string) => t.toLowerCase() === tagName.toLowerCase()
  );
  
  if (tagExists) {
    return null;
  }
  
  // Create transaction
  const tr = state.tr;
  const blockPos = $from.before(blockDepth);
  
  // Update block attributes to add the tag
  tr.setNodeMarkup(blockPos, null, {
    ...blockNode.attrs,
    tags: [...existingTags, tagName],
  });
  
  return tr;
}

/**
 * Add a tag to a block and optionally delete a text range
 * @param view - Editor view
 * @param tagName - Tag name to add
 * @param blockDepth - Depth of the block node
 * @param deleteRange - Optional range to delete { from, to }
 * @returns true if tag was added, false if it already existed
 */
export function addTagAndDeleteText(
  view: EditorView,
  tagName: string,
  blockDepth: number,
  deleteRange?: { from: number; to: number }
): boolean {
  const { state } = view;
  const tr = addTagToBlock(state, tagName, blockDepth);
  
  if (!tr) {
    return false; // Tag already exists
  }
  
  // Delete text range if specified
  if (deleteRange) {
    tr.delete(deleteRange.from, deleteRange.to);
  }
  
  // Dispatch transaction
  view.dispatch(tr);
  return true;
}

