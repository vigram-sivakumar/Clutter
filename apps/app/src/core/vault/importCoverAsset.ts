import { importAsset } from './asset/importAsset';
import { RESERVED_FOLDER_IDS } from './initialize/ReservedResources';
import type { VaultFileSystem } from './providers/VaultFileSystem';

/** Uploaded note/folder cover or icon media is managed content, not an intentional library import. */
export async function importCoverAsset(
  fileSystem: VaultFileSystem,
  vaultRoot: string,
  sourceAbsolutePath: string
): Promise<string> {
  const directory = `${vaultRoot}/${RESERVED_FOLDER_IDS.attachments}`;
  await fileSystem.createDirectory(directory);
  return importAsset(fileSystem, vaultRoot, sourceAbsolutePath, directory);
}
