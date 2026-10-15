import {
  MAX_PARSED_NOTE_CACHE_BYTES,
  type ParsedNoteCacheBackend,
  type ParsedNoteCacheReadResult,
  type ParsedNoteCacheWriteStatus,
} from '../persistence/parsedNoteCache/ParsedNoteCacheBackend';

/**
 * In-memory stand-in for the native cache store, for tests and the web
 * runtime. Failure injection hooks make every recovery path testable.
 */
export class InMemoryParsedNoteCacheBackend implements ParsedNoteCacheBackend {
  /** Cache text by space root. */
  readonly files = new Map<string, string>();
  readFailure: Error | null = null;
  writeFailure: Error | null = null;
  maxBytes = MAX_PARSED_NOTE_CACHE_BYTES;
  readonly writes: string[] = [];

  constructor(
    private readonly idFor: (rootPath: string) => string = (root) =>
      `mem-${root}`
  ) {}

  async read(rootPath: string): Promise<ParsedNoteCacheReadResult> {
    if (this.readFailure) throw this.readFailure;
    const contents = this.files.get(rootPath) ?? null;
    if (
      contents !== null &&
      new TextEncoder().encode(contents).length > this.maxBytes
    ) {
      return {
        spaceId: this.idFor(rootPath),
        contents: null,
        problem: 'oversize',
      };
    }
    return { spaceId: this.idFor(rootPath), contents };
  }

  async write(
    rootPath: string,
    contents: string
  ): Promise<ParsedNoteCacheWriteStatus> {
    if (this.writeFailure) throw this.writeFailure;
    if (new TextEncoder().encode(contents).length > this.maxBytes) {
      this.files.delete(rootPath);
      return 'skipped-oversize';
    }
    this.files.set(rootPath, contents);
    this.writes.push(contents);
    return 'written';
  }

  async remove(rootPath: string): Promise<void> {
    this.files.delete(rootPath);
  }
}
