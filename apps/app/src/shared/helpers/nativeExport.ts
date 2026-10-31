import { invoke } from '@tauri-apps/api/core';

/**
 * Exporting to a place the user chose (Download image, Download file, Download code block) goes through three native
 * commands (`src-tauri/src/export_file.rs`), not the fs plugin's `copy_file`/`write_file`. The destination is picked
 * by the native Save panel, which the native side opens and the webview cannot drive, and what comes back here is an
 * opaque single-use ticket, never a path: a script that wants to overwrite a file in a Space has nothing to name it
 * with. The fs plugin's overwriting commands are no longer granted to the webview at all.
 */
export interface ExportDestination {
  /** Single-use: it stands for the one place the user just chose. */
  readonly ticket: number;
}

/** Opens the native Save panel offering `defaultFileName`. `null` when the user cancelled. */
export async function pickExportDestination(defaultFileName: string): Promise<ExportDestination | null> {
  const ticket = await invoke<number | null>('export_pick_destination', { defaultName: defaultFileName });
  return typeof ticket === 'number' ? { ticket } : null;
}

/** Copies the local file `sourceAbsolutePath` to the chosen destination. The source is only read. */
export async function exportCopyFile(destination: ExportDestination, sourceAbsolutePath: string): Promise<void> {
  await invoke('export_copy_file', { ticket: destination.ticket, from: sourceAbsolutePath });
}

/** Writes `bytes` to the chosen destination. */
export async function exportWriteBytes(destination: ExportDestination, bytes: Uint8Array): Promise<void> {
  await invoke('export_write_file', bytes, { headers: { ticket: String(destination.ticket) } });
}
