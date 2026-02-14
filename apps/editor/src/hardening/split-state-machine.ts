/**
 * 🔒 SPLIT STATE MACHINE — Exhaustive Correctness
 *
 * GUARANTEED CORRECT ENTER KEY BEHAVIOR
 *
 * Four explicit cases, no fallthrough, compiler-enforced exhaustiveness.
 * If a new segment type is added, this MUST be updated (compiler will error).
 */

import type { Segment } from './editor/engine';
import type { CursorPosition } from './editor/engine';

/**
 * Split cases (EXHAUSTIVE)
 *
 * These are the ONLY valid split scenarios.
 * Adding a case without handling it = compile error.
 */
export type SplitCase =
  | 'INSIDE_TEXT' // Cursor inside text: "hel|lo" → "hel" | "lo"
  | 'START_OF_SEGMENT' // Cursor at start: "|hello" → "" | "hello"
  | 'END_OF_SEGMENT' // Cursor at end: "hello|" → "hello" | ""
  | 'AFTER_LAST_SEGMENT'; // Cursor after all: "hello" | → "hello" | ""

/**
 * Determine split case from cursor position
 *
 * This is the ONLY function that decides split behavior.
 * All Enter handlers MUST call this.
 */
export function determineSplitCase(
  segments: readonly Segment[],
  cursor: CursorPosition
): SplitCase {
  const { segmentIndex, offset } = cursor;

  // CASE 1: After all segments
  if (segmentIndex >= segments.length) {
    return 'AFTER_LAST_SEGMENT';
  }

  const segment = segments[segmentIndex];

  // CASE 2-4: Within or at text segment boundary
  if (segment && segment.type === 'text') {
    if (offset === 0) {
      return 'START_OF_SEGMENT';
    } else if (offset === segment.text.length) {
      return 'END_OF_SEGMENT';
    } else {
      return 'INSIDE_TEXT';
    }
  }

  // CASE for inline segments: treat as boundary
  if (offset === 0) {
    return 'START_OF_SEGMENT';
  } else {
    return 'END_OF_SEGMENT';
  }
}

/**
 * Execute split based on determined case
 *
 * EXHAUSTIVE SWITCH - Compiler enforces all cases handled.
 * If you add a SplitCase, this MUST be updated.
 */
export function executeSplit(
  segments: readonly Segment[],
  cursor: CursorPosition,
  splitCase: SplitCase
): {
  head: Segment[];
  tail: Segment[];
} {
  const { segmentIndex, offset } = cursor;

  switch (splitCase) {
    case 'AFTER_LAST_SEGMENT':
      // All content stays in head, tail is empty
      return {
        head: [...segments],
        tail: [],
      };

    case 'START_OF_SEGMENT':
      // Split before this segment
      return {
        head: segments.slice(0, segmentIndex) as Segment[],
        tail: segments.slice(segmentIndex) as Segment[],
      };

    case 'END_OF_SEGMENT':
      // Split after this segment
      return {
        head: segments.slice(0, segmentIndex + 1) as Segment[],
        tail: segments.slice(segmentIndex + 1) as Segment[],
      };

    case 'INSIDE_TEXT': {
      // Split the text segment
      const segment = segments[segmentIndex];
      if (!segment || segment.type !== 'text') {
        throw new Error(
          `[SPLIT] Expected text segment at index ${segmentIndex}`
        );
      }

      const beforeText = segment.text.slice(0, offset);
      const afterText = segment.text.slice(offset);

      const head: Segment[] = [
        ...segments.slice(0, segmentIndex),
        ...(beforeText ? [{ type: 'text' as const, text: beforeText }] : []),
      ];

      const tail: Segment[] = [
        ...(afterText ? [{ type: 'text' as const, text: afterText }] : []),
        ...segments.slice(segmentIndex + 1),
      ];

      return { head, tail };
    }

    default: {
      // 🔒 EXHAUSTIVENESS CHECK
      // If this line errors, you added a SplitCase without handling it
      const _exhaustive: never = splitCase;
      throw new Error(`[SPLIT] Unhandled split case: ${_exhaustive}`);
    }
  }
}

/**
 * 🔒 GUARANTEED CORRECT SPLIT
 *
 * This is the ONLY way Enter key should split nodes.
 * Combines determination + execution + validation.
 */
export function performGuaranteedSplit(
  segments: readonly Segment[],
  cursor: CursorPosition
): {
  head: Segment[];
  tail: Segment[];
  splitCase: SplitCase;
} {
  // Determine case
  const splitCase = determineSplitCase(segments, cursor);

  // Execute split
  const { head, tail } = executeSplit(segments, cursor, splitCase);

  // Validate result
  validateSplitResult(segments, head, tail);

  return { head, tail, splitCase };
}

/**
 * Validate split preserved content
 */
function validateSplitResult(
  original: readonly Segment[],
  head: Segment[],
  tail: Segment[]
): void {
  const originalText = segmentsToText(original);
  const resultText = segmentsToText(head) + segmentsToText(tail);

  if (originalText !== resultText) {
    throw new Error(
      `[SPLIT VALIDATION] Content mismatch.\nOriginal: "${originalText}"\nResult: "${resultText}"`
    );
  }
}

function segmentsToText(segments: readonly Segment[]): string {
  return segments
    .map((s) => (s.type === 'text' ? s.text : `@${s.id}`))
    .join('');
}
