import { constants, cpSync, existsSync, lstatSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
/** Development cache only: never copy Cargo config, credentials or build outputs. */
export function prepareCargoCache(destination, previous) {
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  const source = join(previous, 'registry');
  if (existsSync(source)) {
    if (!lstatSync(source).isDirectory() || lstatSync(source).isSymbolicLink())
      throw Error('UNSAFE_PRIOR_CARGO_REGISTRY');
    cpSync(source, join(destination, 'registry'), {
      recursive: true,
      dereference: false,
      force: false,
      errorOnExist: false,
      mode: constants.COPYFILE_FICLONE,
      filter: (path) =>
        !lstatSync(path).isSymbolicLink() && !path.endsWith('/.package-cache'),
    });
  }
  return destination;
}
export function fetchLockedCargo(cargo, manifest, invoke) {
  const args = ['fetch', '--locked', '--manifest-path', manifest];
  const offline = invoke(cargo, [...args, '--offline']);
  if (offline.error) throw offline.error;
  if (offline.status === 0) return 'private-cache';
  // One setup-only network acquisition. --locked still prohibits graph changes;
  // Cargo validates the downloaded archives against the existing lock checksums.
  const acquired = invoke(cargo, args, { online: true });
  if (acquired.error) throw acquired.error;
  if (acquired.status !== 0)
    throw Error('LOCKED_CARGO_ACQUISITION_FAILED_NO_VERSION_FALLBACK');
  return 'locked-network-acquisition';
}
