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
