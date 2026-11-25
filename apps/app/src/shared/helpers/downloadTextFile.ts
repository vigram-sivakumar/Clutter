import { isTauri } from '@tauri-apps/api/core';
import { exportWriteBytes, pickExportDestination } from './nativeExport';

/**
 * Exports in-memory text content (no source file, no URL — see
 * `downloadResource.ts`/`downloadRemoteImage.ts`'s own doc comments for
 * those two other cases) to a user-chosen destination via the native Save
 * dialog. Structurally identical to `downloadRemoteImage.ts`: `save()`
 * first, content work only after the user actually picks a destination —
 * confirmed directly against the installed `@tauri-apps/plugin-dialog`/
 * `@tauri-apps/api/core` source that neither `save()` nor `invoke()` do
 * any work beyond the immediate IPC dispatch, so there is nothing to
 * reorder for latency here.
 *
 * `getContent` is a callback, not a plain string, for the same "never
 * trust anything resolved before an async gap" reason every other
 * fenced-code control in this codebase re-resolves fresh rather than
 * closing over a captured value — the Save dialog can stay open for as
 * long as the user takes to pick a destination, during which the document
 * (and therefore the fenced block's own content) can change. Calling
 * `getContent()` only after `save()` resolves means the file actually
 * written always reflects the document at save time, not at click time.
 *
 * The content is encoded once here and written by the native export
 * command (`nativeExport.ts`), which writes to the place the Save panel
 * returned and nowhere else. No-op in the web runtime, mirroring both siblings'
 * own `isTauri()` guard — there is no web-runtime download fallback
 * anywhere in this app today.
 */
export async function downloadTextFile(
  getContent: () => string | null,
  defaultFileName: string
): Promise<void> {
  if (!isTauri()) {
    return;
  }

  const destination = await pickExportDestination(defaultFileName);
  if (!destination) {
    return;
  }

  const content = getContent();
  if (content === null) {
    throw new Error('The code block is no longer available.');
  }
  await exportWriteBytes(destination, new TextEncoder().encode(content));
}
