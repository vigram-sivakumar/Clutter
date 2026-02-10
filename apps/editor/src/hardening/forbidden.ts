/**
 * 🔒 FORBIDDEN SYMBOLS — Never Reintroduce
 * 
 * This file documents patterns that MUST NEVER return to the codebase.
 * ESLint rules enforce this at compile time.
 * 
 * ❌ DO NOT REINTRODUCE:
 * - node.text (use node.segments instead)
 * - node.meta (deleted, use segments)
 * - InlineMeta type (deleted, use Segment)
 * - bias ("before" | "after") (deleted, use segmentIndex)
 * - TreeWalker (use direct DOM child iteration)
 * - extractPureText (use getPlainText from SegmentUtils)
 * - NodeWithMeta (deleted, use Node with segments)
 * - OldNode (deleted, migration complete)
 * - applyIntent (deleted, use direct mutations)
 * - CursorBias (deleted, use CursorPosition)
 * 
 * WHY THESE ARE FORBIDDEN:
 * 
 * 1. node.text / node.meta
 *    - Dual-mode architecture causes sync bugs
 *    - Enter key duplication
 *    - Segments is the ONLY source of truth
 * 
 * 2. bias
 *    - Ambiguous cursor positioning
 *    - Caused drift bugs
 *    - segmentIndex + offset is deterministic
 * 
 * 3. TreeWalker
 *    - Heuristic DOM traversal
 *    - Caused caret placement bugs
 *    - Caret-anchors + direct iteration is explicit
 * 
 * 4. Intent system
 *    - Over-engineered
 *    - Editor observes browser, doesn't "intend"
 *    - Direct mutations are clearer
 * 
 * IF YOU NEED THESE PATTERNS:
 * - Stop. You don't.
 * - The segmented architecture replaces all of them.
 * - If you think you need them, you're solving the wrong problem.
 * 
 * ENFORCEMENT:
 * - ESLint: no-restricted-syntax
 * - ESLint: no-restricted-properties
 * - TypeScript: Node interface doesn't have these fields
 * - Code review: Auto-reject PRs introducing these
 */

// This file intentionally contains no exports.
// It exists purely for documentation and ESLint enforcement.

/**
 * Example forbidden patterns (for ESLint rules):
 * 
 * ❌ node.text
 * ❌ node.meta
 * ❌ extractPureText()
 * ❌ TreeWalker
 * ❌ new TreeWalker()
 * ❌ document.createTreeWalker()
 * ❌ CursorBias
 * ❌ bias: "before" | "after"
 * ❌ NodeWithMeta
 * ❌ InlineMeta
 * ❌ applyIntent()
 */

export const FORBIDDEN_PATTERNS = [
  'node.text',
  'node.meta',
  'extractPureText',
  'TreeWalker',
  'CursorBias',
  'NodeWithMeta',
  'InlineMeta',
  'applyIntent',
  'OldNode',
] as const;

export type ForbiddenPattern = typeof FORBIDDEN_PATTERNS[number];
