import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { supportedResourceFileExtensions } from '@core/vault/ingest/SupportedResourceKind';

/**
 * The one "Upload assets" action: pick files and copy them into the folder an
 * Assets page is showing — `Assets/` itself when no destination is given — via
 * the same import the cover upload uses (collision-free naming), and let the
 * vault's normal ingest/watch pick them up as resources. Shared by the Assets
 * page's Upload button and the sidebar top controls' Upload menu item.
 */
export async function uploadAssets(
  importAsset: (sourceAbsolutePath: string, destinationFolderPath?: string) => Promise<unknown>,
  destinationFolderPath?: string
): Promise<void> {
  const selected = await openFileDialog({
    multiple: true,
    directory: false,
    filters: [{ name: 'Images and PDFs', extensions: supportedResourceFileExtensions() }],
  });
  const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];

  for (const sourcePath of paths) {
    await importAsset(sourcePath, destinationFolderPath);
  }
}
