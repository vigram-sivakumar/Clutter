import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { supportedResourceFileExtensions } from '@core/vault/ingest/SupportedResourceKind';

/** What an upload did: how many files were picked (0 when the picker was cancelled) and which could not be added. */
export interface UploadAssetsResult {
  readonly total: number;
  readonly failed: readonly string[];
  readonly firstError?: unknown;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * The user-facing message for an upload that did not add every file, or `null` when it did (or nothing
 * was picked). A partial failure says how many were left, never that the whole upload failed.
 */
export function uploadFailureMessage({ total, failed }: UploadAssetsResult): string | null {
  if (failed.length === 0) {
    return null;
  }

  if (failed.length === total) {
    return total === 1 ? `Couldn’t add ${fileName(failed[0] as string)}` : `Couldn’t add ${total} files`;
  }

  return `Couldn’t add ${failed.length} of ${total} files`;
}

/** Reports an upload that did not add every file; silent when it did. */
export function reportUpload(notifier: { fail(text: string, error?: unknown): unknown }, result: UploadAssetsResult): void {
  const message = uploadFailureMessage(result);

  if (message) {
    notifier.fail(message, result.firstError);
  }
}

/**
 * The one "Upload assets" action: pick files and copy them into the folder an
 * Assets page is showing — `Assets/` itself when no destination is given — via
 * the same import the cover upload uses (collision-free naming), and let the
 * vault's normal ingest/watch pick them up as resources. Shared by the Assets
 * page's Upload button and the sidebar top controls' Upload menu item.
 *
 * Every picked file is attempted even if one fails, and the result says which did not
 * go in, so the caller can report a partial failure accurately.
 */
export async function uploadAssets(
  importAsset: (sourceAbsolutePath: string, destinationFolderPath?: string) => Promise<unknown>,
  destinationFolderPath?: string
): Promise<UploadAssetsResult> {
  const selected = await openFileDialog({
    multiple: true,
    directory: false,
    filters: [{ name: 'Images and PDFs', extensions: supportedResourceFileExtensions() }],
  });
  const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
  const failed: string[] = [];
  let firstError: unknown;

  for (const sourcePath of paths) {
    try {
      await importAsset(sourcePath, destinationFolderPath);
    } catch (error) {
      if (failed.length === 0) {
        firstError = error;
      }
      failed.push(sourcePath);
    }
  }

  return failed.length === 0 ? { total: paths.length, failed } : { total: paths.length, failed, firstError };
}
