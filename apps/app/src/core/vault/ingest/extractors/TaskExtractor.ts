export interface ScannedTask {
  readonly text: string;
  readonly completed: boolean;
  readonly dueDate?: string;
  readonly completedAt?: string;
}

// Inline occurrence metadata: `@key:value`, recognized keys only — an
// unrecognized key is left untouched in `text` rather than stripped, so
// Clutter never silently discards text it doesn't yet understand.
//
// Extending this to a new key (@priority, @repeat, @estimate, @reminder)
// means adding one entry here and one field on ScannedTask/TaskOccurrence
// — the token grammar itself (@key:value) does not change.
type RecognizedMetadataKey = 'due' | 'completed';

const RECOGNIZED_METADATA_KEYS: ReadonlySet<string> = new Set<RecognizedMetadataKey>([
  'due',
  'completed',
]);

// TODO: @priority, @repeat, @estimate, @reminder — not yet recognized, so
// tokens using these keys pass through untouched in `text` today.

export class TaskExtractor {
  private static readonly METADATA_TOKEN = /@([a-zA-Z]+):(\S+)/g;

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
    const match = line.match(/^\s*- \[( |x|X)\]\s+(.+)$/);

    if (!match) {
      return null;
    }

    const rawText = match[2];

    if (!rawText) {
      return null;
    }

    const completedMarker = match[1];

    if (!completedMarker) {
      return null;
    }

    const { text, metadata } = this.extractMetadata(rawText);

    return {
      completed: completedMarker.toLowerCase() === 'x',
      text,
      dueDate: metadata.due,
      completedAt: metadata.completed,
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
      TaskExtractor.METADATA_TOKEN,
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
