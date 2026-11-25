import { describe, expect, it } from 'vitest';

import { DestinationExistsError, MAX_DESTINATION_ATTEMPTS } from '../providers/VaultFileSystem';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { importAsset, importAssetBytes } from './importAsset';
import { importRemoteAsset } from './importRemoteAsset';

const ROOT = '/vault';
const THEIRS = 'a file another process created';

/**
 * A disk where another process takes the name a caller has just chosen: `takeNames` files appear, one per write
 * attempt, in the instant between the free-name listing and the write — the window an `exists()` check cannot close.
 * Everything else behaves as the in-memory disk does, which refuses to replace (like the real provider).
 */
class RacingFileSystem extends InMemoryVaultFileSystem {
  attempts: string[] = [];

  constructor(private takeNames: number) {
    super();
  }

  private maybeTake(destination: string): void {
    this.attempts.push(destination);
    if (this.takeNames > 0) {
      this.takeNames -= 1;
      this.seedFile(destination, THEIRS);
    }
  }

  override async copyFile(source: string, destination: string): Promise<void> {
    this.maybeTake(destination);
    return super.copyFile(source, destination);
  }

  override async writeBinaryFile(path: string, bytes: Uint8Array): Promise<void> {
    this.maybeTake(path);
    return super.writeBinaryFile(path, bytes);
  }
}

describe('importAsset — a name taken between choosing it and writing it', () => {
  it('keeps the other file untouched and the source intact, and imports under the next free name', async () => {
    const fileSystem = new RacingFileSystem(1);
    fileSystem.seedFile('/external/photo.png', 'my image');

    const reference = await importAsset(fileSystem, ROOT, '/external/photo.png');

    expect(reference).toBe('Assets/photo 2.png');
    expect(fileSystem.getFileSync(`${ROOT}/Assets/photo.png`)).toBe(THEIRS);
    expect(fileSystem.getFileSync(`${ROOT}/Assets/photo 2.png`)).toBe('my image');
    expect(fileSystem.getFileSync('/external/photo.png')).toBe('my image');
    expect(fileSystem.attempts).toEqual([`${ROOT}/Assets/photo.png`, `${ROOT}/Assets/photo 2.png`]);
  });

  it('survives the name being taken again, and again', async () => {
    const fileSystem = new RacingFileSystem(3);
    fileSystem.seedFile('/external/photo.png', 'my image');

    const reference = await importAsset(fileSystem, ROOT, '/external/photo.png');

    expect(reference).toBe('Assets/photo 4.png');
    for (const taken of ['photo.png', 'photo 2.png', 'photo 3.png']) {
      expect(fileSystem.getFileSync(`${ROOT}/Assets/${taken}`)).toBe(THEIRS);
    }
    expect(fileSystem.getFileSync('/external/photo.png')).toBe('my image');
  });

  it('into a folder inside Assets, the retry stays in that folder', async () => {
    const fileSystem = new RacingFileSystem(1);
    await fileSystem.createDirectory(`${ROOT}/Assets/Trips`);
    fileSystem.seedFile('/external/photo.png', 'my image');

    const reference = await importAsset(fileSystem, ROOT, '/external/photo.png', `${ROOT}/Assets/Trips`);

    expect(reference).toBe('Assets/Trips/photo 2.png');
    expect(fileSystem.getFileSync(`${ROOT}/Assets/Trips/photo.png`)).toBe(THEIRS);
  });

  it('treats a same-named directory as occupied and never replaces it', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    await fileSystem.createDirectory(`${ROOT}/Assets/photo.png`);
    fileSystem.seedFile('/external/photo.png', 'my image');
    expect(await importAsset(fileSystem, ROOT, '/external/photo.png')).toBe('Assets/photo 2.png');
    expect(await fileSystem.exists(`${ROOT}/Assets/photo.png`)).toBe(true);
  });

  it('a failure that is not a collision is not retried and nothing is left behind', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    await expect(importAsset(fileSystem, ROOT, '/external/missing.png')).rejects.toThrow('source file not found');

    expect(await fileSystem.readDirectory(`${ROOT}/Assets`)).toEqual([]);
  });
});

describe('importAssetBytes — a name taken between choosing it and writing it', () => {
  it('keeps the other file untouched and writes the pasted bytes under the next free name', async () => {
    const fileSystem = new RacingFileSystem(1);
    const pasted = new Uint8Array([1, 2, 3]);

    const reference = await importAssetBytes(fileSystem, ROOT, 'Pasted image.png', pasted);

    expect(reference).toBe('Assets/Pasted image 2.png');
    expect(fileSystem.getFileSync(`${ROOT}/Assets/Pasted image.png`)).toBe(THEIRS);
    expect(await fileSystem.readBinaryFile(`${ROOT}/Assets/Pasted image 2.png`)).toEqual(pasted);
  });

  it('writing onto an existing file directly is refused and the file keeps its contents', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile(`${ROOT}/Assets/a.png`, 'original');

    await expect(fileSystem.writeBinaryFile(`${ROOT}/Assets/a.png`, new Uint8Array([9]))).rejects.toBeInstanceOf(
      DestinationExistsError
    );
    // The same name in another case is the same file on APFS.
    await expect(fileSystem.writeBinaryFile(`${ROOT}/Assets/A.PNG`, new Uint8Array([9]))).rejects.toBeInstanceOf(
      DestinationExistsError
    );
    expect(fileSystem.getFileSync(`${ROOT}/Assets/a.png`)).toBe('original');
  });

  it('copying onto an existing file or folder directly is refused and both keep their contents', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile('/external/a.png', 'source');
    fileSystem.seedFile(`${ROOT}/Assets/a.png`, 'original');
    await fileSystem.createDirectory(`${ROOT}/Assets/folder.png`);

    await expect(fileSystem.copyFile('/external/a.png', `${ROOT}/Assets/a.png`)).rejects.toBeInstanceOf(DestinationExistsError);
    await expect(fileSystem.copyFile('/external/a.png', `${ROOT}/Assets/folder.png`)).rejects.toBeInstanceOf(DestinationExistsError);
    expect(fileSystem.getFileSync(`${ROOT}/Assets/a.png`)).toBe('original');
    expect(fileSystem.getFileSync('/external/a.png')).toBe('source');
  });
});

describe('importRemoteAsset — a name taken between choosing it and writing it', () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const png = async () => ({ bytes, contentType: 'image/png' });

  it('keeps the other file untouched and reports where the download really went', async () => {
    const fileSystem = new RacingFileSystem(1);

    const saved = await importRemoteAsset(fileSystem, ROOT, 'https://a.com/sunset.png', png, { displayName: 'Sunset' });

    expect(saved).toEqual({ reference: 'Assets/Sunset 2.png', absolutePath: `${ROOT}/Assets/Sunset 2.png`, reused: false });
    expect(fileSystem.getFileSync(`${ROOT}/Assets/Sunset.png`)).toBe(THEIRS);
    expect(await fileSystem.readBinaryFile(saved.absolutePath)).toEqual(bytes);
  });

  it('a name that keeps being taken fails without replacing anything', async () => {
    const fileSystem = new RacingFileSystem(MAX_DESTINATION_ATTEMPTS + 5);

    await expect(
      importRemoteAsset(fileSystem, ROOT, 'https://a.com/sunset.png', png, { displayName: 'Sunset' })
    ).rejects.toBeInstanceOf(DestinationExistsError);

    expect(fileSystem.attempts).toHaveLength(MAX_DESTINATION_ATTEMPTS);
    for (const attempt of fileSystem.attempts) {
      expect(fileSystem.getFileSync(attempt)).toBe(THEIRS);
    }
  });
});
