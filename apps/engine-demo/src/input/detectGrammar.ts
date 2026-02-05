/**
 * PHASE B — GRAMMAR DETECTION
 *
 * Detects which grammar (if any) is active at cursor position.
 *
 * Rules:
 * - Grammar only activates inside a word starting with /, @, or #
 * - Space commits the grammar (cancels detection)
 * - Escape cancels grammar
 * - Cursor move outside range cancels grammar
 *
 * Priority order:
 * 1. Selection context (highest)
 * 2. Slash commands /
 * 3. At-mentions @
 * 4. Hashtags #
 * 5. Plain text (fallback)
 */

import type {
  GrammarDetection,
  TextRange,
  GrammarContext,
} from './grammarTypes';
import { parseSlash } from './parseSlash';
import { parseMention, isEmailPattern } from './parseMention';
import { parseHashtag } from './parseHashtag';

/**
 * Detect active grammar at cursor position
 *
 * Pure function. No side effects.
 */
export function detectGrammar(
  text: string,
  context: GrammarContext
): GrammarDetection {
  const { cursorOffset, selectionRange } = context;

  // PRIORITY 1: Selection context
  // If text is selected, different rules apply
  if (selectionRange && selectionRange.from !== selectionRange.to) {
    // Selection grammar handled separately
    // For now, no active grammar on selection
    return {
      active: false,
      reason: 'Selection context (not yet implemented)',
    };
  }

  // Find word boundaries around cursor
  const wordRange = findWordAtCursor(text, cursorOffset);

  if (!wordRange) {
    return {
      active: false,
      reason: 'Cursor not in word',
    };
  }

  const word = text.slice(wordRange.from, wordRange.to);

  // PRIORITY 2: Slash commands
  if (word.startsWith('/')) {
    const grammar = parseSlash(word, wordRange);
    if (grammar) {
      return { active: true, grammar };
    }
  }

  // PRIORITY 3: At-mentions (with email filtering)
  if (word.startsWith('@')) {
    // PHASE 3B: Skip if looks like email
    const atIndex = text.indexOf('@', wordRange.from);
    if (atIndex !== -1 && isEmailPattern(text, atIndex)) {
      return {
        active: false,
        reason: 'Email pattern detected',
      };
    }

    const grammar = parseMention(word, wordRange);
    if (grammar) {
      return { active: true, grammar };
    }
  }

  // PRIORITY 4: Hashtags
  if (word.startsWith('#')) {
    const grammar = parseHashtag(word, wordRange);
    if (grammar) {
      return { active: true, grammar };
    }
  }

  // PRIORITY 5: Plain text (no active grammar)
  return {
    active: false,
    reason: 'No grammar trigger character',
  };
}

/**
 * Find word boundaries at cursor position
 *
 * A "word" for grammar purposes is:
 * - Starts with whitespace or line start
 * - Ends with whitespace, line end, or punctuation
 * - Contains no spaces
 */
export function findWordAtCursor(
  text: string,
  offset: number
): TextRange | null {
  if (offset < 0 || offset > text.length) {
    return null;
  }

  // Special case: cursor at end of text
  if (offset === text.length && text.length > 0) {
    // Check if last character is whitespace
    if (/\s/.test(text[text.length - 1]!)) {
      return null;
    }
  }

  // Find start of word (scan backwards)
  let from = offset;
  while (from > 0 && !/\s/.test(text[from - 1]!)) {
    from--;
  }

  // Find end of word (scan forwards)
  let to = offset;
  while (to < text.length && !/\s/.test(text[to]!)) {
    to++;
  }

  // Must have content
  if (from === to) {
    return null;
  }

  return { from, to };
}

/**
 * Check if grammar should be cancelled
 *
 * Grammar cancels when:
 * - Space is typed (commits grammar)
 * - Escape is pressed
 * - Cursor moves outside grammar range
 */
export function shouldCancelGrammar(
  previousOffset: number,
  newOffset: number,
  grammarRange: TextRange,
  keyPressed?: string
): boolean {
  // Escape cancels
  if (keyPressed === 'Escape') {
    return true;
  }

  // Space commits (which also cancels detection)
  if (keyPressed === ' ') {
    return true;
  }

  // Cursor moved outside range
  if (newOffset < grammarRange.from || newOffset > grammarRange.to) {
    return true;
  }

  return false;
}

/**
 * Check if character triggers grammar
 */
export function isGrammarTrigger(char: string): boolean {
  return char === '/' || char === '@' || char === '#';
}

/**
 * Extract grammar prefix from text
 *
 * Returns the trigger character and any following content.
 */
export function extractGrammarPrefix(
  text: string,
  offset: number
): {
  trigger: '/' | '@' | '#' | null;
  content: string;
  range: TextRange;
} | null {
  const wordRange = findWordAtCursor(text, offset);

  if (!wordRange) {
    return null;
  }

  const word = text.slice(wordRange.from, wordRange.to);
  const firstChar = word[0];

  if (!firstChar || !isGrammarTrigger(firstChar)) {
    return null;
  }

  return {
    trigger: firstChar as '/' | '@' | '#',
    content: word.slice(1), // Everything after trigger
    range: wordRange,
  };
}
