import { writeToFreeAssetName } from '../../vault/asset/importAsset';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';
import { VaultPath } from '../../vault/ingest/VaultPath';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import type { SpaceProfileAvatar } from './SpaceProfileStore';

const MEDIA = '.clutter/media';
const OWNED_AVATAR = /^\.clutter\/media\/avatar-[0-9a-f-]{36}(?: \d+)?\.[a-z0-9]+$/i;

export async function copyManagedSpaceAvatar(fileSystem: VaultFileSystem, root: string, source: string): Promise<SpaceProfileAvatar & { type: 'image' }> {
  const extension = VaultPath.extension(source);
  if (!/^\.[a-z0-9]+$/i.test(extension)) throw new Error('An avatar image needs a file extension');
  const destination = `${root}/${MEDIA}`;
  await fileSystem.createDirectory(destination);
  const { reference } = await writeToFreeAssetName(
    fileSystem, root, `avatar-${new UuidGenerator().generate()}${extension}`, destination,
    (path) => fileSystem.copyFile(source, path)
  );
  return { type: 'image', src: reference };
}

/** Only generated, private avatars qualify. Legacy library assets are never automatically removed. */
export async function removeReplacedManagedAvatar(fileSystem: VaultFileSystem, root: string, previous: SpaceProfileAvatar | undefined, next: SpaceProfileAvatar | undefined): Promise<void> {
  if (previous?.type !== 'image' || !OWNED_AVATAR.test(previous.src) || (next?.type === 'image' && previous.src === next.src)) return;
  try {
    await fileSystem.deleteFile(`${root}/${previous.src}`);
  } catch (error) {
    console.warn('Could not remove an old managed Space avatar', error);
  }
}
