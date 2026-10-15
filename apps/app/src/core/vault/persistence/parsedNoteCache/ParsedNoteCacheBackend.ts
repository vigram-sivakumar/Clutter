/**
 * Where the parsed-note cache text lives (ADR-053): Platform's seam to the
 * native cache store, which keeps files in the application cache directory,
 * outside the Markdown space. The webview never names a path; the backend is
 * given the space root only so it can derive an opaque id.
 */
export interface ParsedNoteCacheReadResult {
  /** Opaque id of the space (recorded in, and verified against, the cache text). */
  readonly spaceId: string;
  /** The cache text, or null when there is no usable file. */
  readonly contents: string | null;
  /** Why an existing file was not usable (e.g. 'oversize'), if it wasn't. */
  readonly problem?: string;
}

export type ParsedNoteCacheWriteStatus = 'written' | 'skipped-oversize';

export interface ParsedNoteCacheBackend {
  read(rootPath: string): Promise<ParsedNoteCacheReadResult>;
  write(
    rootPath: string,
    contents: string
  ): Promise<ParsedNoteCacheWriteStatus>;
  remove(rootPath: string): Promise<void>;
}

/** Provisional, defensive limit on the serialized cache per space (ADR-053). */
export const MAX_PARSED_NOTE_CACHE_BYTES = 64 * 1024 * 1024;
