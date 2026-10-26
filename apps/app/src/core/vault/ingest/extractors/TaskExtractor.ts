import { fencedCodeRanges, isInsideAnyRange } from './markdownCodeRanges';

export interface ScannedTask {
  readonly text: string;
  readonly completed: boolean;
  readonly dueDate?: string;
  // The optional `THH:MM` time-of-day carried by the same due-date token
  // (`@YYYY-MM-DDTHH:MM`, or `@due:YYYY-MM-DDTHH:MM`) — never present
  // without `dueDate`. Shape-matched only, same zero-calendar-validation
  // posture as `dueDate` itself.
  readonly dueTime?: string;
  readonly completedAt?: string;
  // The exact, unmodified source line this task was extracted from —
  // fulfils Occurrence.rawText's long-reserved "populate during analysis"
  // contract. TaskOperations (the mutation facade) checks it against the
  // text at startOffset/endOffset (the occurrence's positional identity,
  // below) before rewriting that line.
  readonly rawText: string;
  // The task line's exact character range within the original document
  // (the same `content` string passed to `extract()` — never a trimmed or
  // otherwise transformed copy), fulfilling Occurrence.startOffset/
  // endOffset's long-reserved "populate during analysis" contract.
  // `startOffset` is the index of the line's first character (including
  // leading indentation); `endOffset` is exclusive and excludes the
  // trailing newline. Computed positionally from the running per-line
  // offset `extract()` already tracks — this is what makes two
  // textually-identical task lines distinguishable: their `rawText` is
  // equal, but their offsets never are.
  readonly startOffset: number;
  readonly endOffset: number;
}

// Inline occurrence metadata: `@key:value`, recognized keys only — an
// unrecognized key is left untouched in `text` rather than stripped, so
// Clutter never silently discards text it doesn't yet understand.
//
// Extending this to a new key (@priority, @repeat, @estimate, @reminder)
// means adding one entry here and one field on ScannedTask/TaskOccurrence
// — the token grammar itself (@key:value) does not change.
export type RecognizedMetadataKey = 'due' | 'completed';

export const RECOGNIZED_METADATA_KEYS: ReadonlySet<string> = new Set<RecognizedMetadataKey>([
  'due',
  'completed',
]);

// TODO: @priority, @repeat, @estimate, @reminder — not yet recognized, so
// tokens using these keys pass through untouched in `text` today.

// Exported so TaskOperations (the mutation facade) can locate and rewrite
// a task's checkbox/metadata without duplicating this recognition logic —
// same regexes, read side and write side (ARCHITECTURE_RULES rule 4).
export const TASK_LINE_PATTERN = /^(\s*)- \[( |x|X)\]\s+(.+)$/;
export const METADATA_TOKEN_PATTERN = /@([a-zA-Z]+):(\S+)/g;

/**
 * Shape-only match for a bare `@YYYY-MM-DD` Date reference — deliberately
 * independent of `codemirror/date/dateScanner.ts`'s own identical-shape
 * regex, not imported from it: this extractor is Vault Ingest (plain
 * regex over a string), the editor's scanner is Lezer-integration glue,
 * and nothing in this codebase lets a `core/vault/` file import from
 * `features/markdown/editor/` (the dependency only ever points the other
 * way). Same non-sharing precedent `TagExtractor.ts`'s own regex already
 * sets relative to `tagScanner.ts` — two independently-maintained regexes
 * expressing the same grammar shape, not one shared implementation, for
 * exactly this layering reason. The boundary rule (preceded by
 * whitespace/start, not immediately followed by another alphanumeric
 * character) mirrors `dateScanner.ts`'s own rule so `@2026-08-20x`,
 * `foo@2026-08-20`, etc. are rejected identically by both.
 *
 * Shape-matched only, not calendar-validated — same parse-vs-validate
 * split the editor's `Date` node uses (`isValidCalendarDate`,
 * `shared/helpers/time`): an invalid-but-shaped date like `@2026-13-45`
 * still gets captured as `dueDate` here, exactly as `@due:` already
 * captures its value with zero validation today. Not a new leniency this
 * change introduces — a pre-existing property of this extractor.
 *
 * Captures an optional trailing `THH:MM` time-of-day as part of the same
 * token (`@2026-10-23T07:00`) — `splitDueDate` below is what separates it
 * back into `dueDate`/`dueTime`. Capturing it here (rather than a second,
 * separate time pattern) keeps the "first bare date wins" and
 * find/replace logic in this file and `TaskOperations.ts` working on one
 * indivisible token, exactly as before.
 */
export const BARE_DATE_PATTERN = /(^|\s)@(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?)(?![A-Za-z0-9])/;

/** Splits a raw due-date capture (`BARE_DATE_PATTERN`'s group 2, or a raw `@due:` value) into its date and
 * optional time parts. A value that isn't shaped as `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` is returned as `dueDate`
 * verbatim with no time — the same zero-validation leniency `@due:` already had for any other malformed value. */
export function splitDueDate(raw: string | undefined): { dueDate?: string; dueTime?: string } {
  if (raw === undefined) {
    return {};
  }

  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/.exec(raw);

  if (!match) {
    return { dueDate: raw };
  }

  return { dueDate: match[1], dueTime: match[2] };
}

export class TaskExtractor {
  extract(content: string): readonly ScannedTask[] {
    const tasks: ScannedTask[] = [];
    const codeRanges = fencedCodeRanges(content);

    let offset = 0;
    for (const line of content.split('\n')) {
      if (!isInsideAnyRange(offset, codeRanges)) {
        const task = this.extractFromLine(line, offset);

        if (task) {
          tasks.push(task);
        }
      }

      offset += line.length + 1;
    }

    return tasks;
  }

  private extractFromLine(line: string, offset: number): ScannedTask | null {
    const match = line.match(TASK_LINE_PATTERN);

    if (!match) {
      return null;
    }

    const completedMarker = match[2];
    const rest = match[3];

    if (!completedMarker || !rest) {
      return null;
    }

    const { text, metadata } = this.extractMetadata(rest);

    // `@due:` (legacy, still fully supported for existing vault content —
    // never generated by Clutter for new tasks as of the v1 bare-date
    // syntax) wins when both are present on the same line: it's an
    // explicit, unambiguous signal a user typed on purpose, whereas a bare
    // date is inferred. A task with no `@due:` falls back to the FIRST
    // bare Date reference in its text, deterministically — a task
    // mentioning two dates ("moved from @2026-08-01 to @2026-08-20") is a
    // real, plausible case with no natural "which one is the due date"
    // answer; picking the first one written (rather than silently
    // guessing at intent some other way, or introducing an ambiguous-state
    // concept `ScannedTask.dueDate` has no room for as a single optional
    // field) is the smallest deterministic rule that doesn't require new
    // plumbing. The bare date is deliberately NOT stripped from `text`
    // (unlike `@due:`, which is pure metadata syntax with no other
    // purpose) — a Date reference is real content a user wrote and may
    // want to keep seeing/clicking, not hidden machine metadata; stripping
    // it would also risk leaving a malformed sentence behind when a
    // second, non-due date remains in the same text.
    const rawDue = metadata.due ?? BARE_DATE_PATTERN.exec(text)?.[2];
    const { dueDate, dueTime } = splitDueDate(rawDue);

    return {
      completed: completedMarker.toLowerCase() === 'x',
      text,
      dueDate,
      dueTime,
      completedAt: metadata.completed,
      rawText: line,
      startOffset: offset,
      endOffset: offset + line.length,
    };
  }

  // Strips recognized @key:value tokens out of the task text and returns
  // their values, keyed by name. An unrecognized key, or a token that
  // doesn't match the @key:value shape at all, is simply never matched —
  // it stays in `text` exactly as written, and nothing throws.
  private extractMetadata(text: string): {
    text: string;
    metadata: Partial<Record<RecognizedMetadataKey, string>>;
  } {
    const metadata: Partial<Record<RecognizedMetadataKey, string>> = {};

    const stripped = text.replace(
      METADATA_TOKEN_PATTERN,
      (token, key: string, value: string) => {
        if (!RECOGNIZED_METADATA_KEYS.has(key)) {
          return token;
        }

        metadata[key as RecognizedMetadataKey] = value;
        return '';
      }
    );

    return { text: stripped.trim().replace(/ {2,}/g, ' '), metadata };
  }
}
