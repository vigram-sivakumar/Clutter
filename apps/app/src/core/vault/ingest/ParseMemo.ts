import type { ParsedMarkdown } from './FrontmatterParser';

/**
 * Everything `FrontmatterParser.parse` derives from a file's text except the
 * body, which is recomputed by the parser's cheap `split`. This is the whole
 * of what a parse memo may supply.
 */
export type ParsedNoteParts = Omit<ParsedMarkdown, 'body'>;

/**
 * A memo of `FrontmatterParser.parse` (ADR-053). Ingest only *reads* through
 * it and reports what it parsed; it never writes to disk, and an absent memo
 * (the default) means every file is parsed exactly as before.
 *
 * Implementations must never let a stale or mismatched result through: the
 * key identifies the exact text, `recall` returns a fresh copy (never shared
 * mutable state), and every failure is "no result".
 */
export interface ParseMemo {
  /** A key for exactly this text, or null when memoization is unavailable. */
  keyOf(text: string): Promise<string | null>;
  /** A fresh copy of the parts recorded for `key`, or undefined. */
  recall(key: string): ParsedNoteParts | undefined;
  /** Records the parts parsed from the text that `key` identifies. Never throws. */
  remember(key: string, parts: ParsedNoteParts): void;
}
