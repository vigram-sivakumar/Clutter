import { invoke } from '@tauri-apps/api/core';
import type {
  ParsedNoteCacheBackend,
  ParsedNoteCacheReadResult,
  ParsedNoteCacheWriteStatus,
} from '../persistence/parsedNoteCache/ParsedNoteCacheBackend';

/** Native cache store (src-tauri/src/parse_cache.rs): application cache dir, atomic writes. */
export class TauriParsedNoteCacheBackend implements ParsedNoteCacheBackend {
  read(rootPath: string): Promise<ParsedNoteCacheReadResult> {
    return invoke<ParsedNoteCacheReadResult>('parse_cache_read', { rootPath });
  }

  write(
    rootPath: string,
    contents: string
  ): Promise<ParsedNoteCacheWriteStatus> {
    return invoke<ParsedNoteCacheWriteStatus>('parse_cache_write', {
      rootPath,
      contents,
    });
  }

  remove(rootPath: string): Promise<void> {
    return invoke<void>('parse_cache_remove', { rootPath });
  }
}
