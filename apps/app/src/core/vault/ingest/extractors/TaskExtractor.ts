export interface ScannedTask {
  readonly text: string;
  readonly completed: boolean;
  readonly dueDate?: string;
  readonly completedAt?: string;
  // The exact, unmodified source line this task was extracted from —
  // fulfils Occurrence.rawText's long-reserved "populate during analysis"
  // contract. This is what TaskOperations (the mutation facade) matches
  // against to locate the line it needs to rewrite; there is no other
  // stable identity for a task occurrence today.
  readonly rawText: string;
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

export class TaskExtractor {
  extract(content: string): readonly ScannedTask[] {
    const tasks: ScannedTask[] = [];

    for (const line of content.split('\n')) {
      const task = this.extractFromLine(line);

      if (task) {
        tasks.push(task);
      }
    }

    return tasks;
  }

  private extractFromLine(line: string): ScannedTask | null {
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

    return {
      completed: completedMarker.toLowerCase() === 'x',
      text,
      dueDate: metadata.due,
      completedAt: metadata.completed,
      rawText: line,
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
