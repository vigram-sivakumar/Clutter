/**
 * PHASE 09 — REFERENCE PARSER (File 09)
 *
 * Parses [[ references into structured grammar.
 *
 * References are semantic node relationships, not text.
 *
 * Examples:
 * - [[ → empty query
 * - [[Project → query: 'Project'
 * - [[Meeting Notes → query: 'Meeting Notes'
 */

import type { ReferenceGrammar, TextRange } from './grammarTypes';

/**
 * Parse reference from text
 *
 * Input: "[[query" from word boundary
 * Output: { type: 'reference', query: 'query', ... }
 */
export function parseReference(
  word: string,
  range: TextRange
): ReferenceGrammar | null {
  // Must start with [[
  if (!word.startsWith('[[')) {
    return null;
  }

  // Extract query after [[
  const query = word.slice(2).trim();

  return {
    type: 'reference',
    query,
    range,
    raw: word,
  };
}
