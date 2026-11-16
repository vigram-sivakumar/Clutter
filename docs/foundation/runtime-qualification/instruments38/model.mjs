import { lstatSync, realpathSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

// lstat walks each entry once: framework symlink aliases never multiply contents.
// st_blocks is reported allocation, not unique APFS clone/compression ownership.
export function installedBytes(root) {
  const base = realpathSync(root),
    seen = new Set();
  let logicalBytes = 0,
    allocatedBytes = 0,
    files = 0,
    directories = 0,
    symlinks = 0;
  function visit(path) {
    const stat = lstatSync(path);
    if (
      !Number.isSafeInteger(stat.blocks) ||
      stat.blocks < 0 ||
      !Number.isSafeInteger(stat.size)
    )
      throw Error('ALLOCATION_METADATA_UNAVAILABLE');
    const inode = String(stat.dev) + ':' + String(stat.ino);
    if (!seen.has(inode)) {
      allocatedBytes += stat.blocks * 512;
      seen.add(inode);
    }
    if (stat.isSymbolicLink()) {
      const target = realpathSync(path);
      if (target !== base && !target.startsWith(base + sep))
        throw Error('INSTALLED_SYMLINK_ESCAPES_BUNDLE');
      logicalBytes += stat.size;
      symlinks++;
    } else if (stat.isDirectory()) {
      directories++;
      for (const name of readdirSync(path).sort()) visit(join(path, name));
    } else if (stat.isFile()) {
      logicalBytes += stat.size;
      files++;
    } else throw Error('UNSUPPORTED_INSTALLED_ENTRY');
    if (
      !Number.isSafeInteger(allocatedBytes) ||
      !Number.isSafeInteger(logicalBytes)
    )
      throw Error('SIZE_OVERFLOW');
  }
  visit(base);
  return {
    logicalBytes,
    allocatedBytes,
    files,
    directories,
    symlinks,
    accounting:
      'Logical bytes per non-directory entry including symlink target names; allocation sums st_blocks*512 once per dev/inode including directories. No symlink traversal. APFS clone/shared extents not deduplicated.',
  };
}
export function prepareArgs(args) {
  if (
    args.length !== 2 ||
    args[0] !== '--run' ||
    !/^[A-Za-z0-9-]{1,100}$/.test(args[1])
  )
    throw Error('USE_--run_COMPLETED_BUILD_ID');
  return args[1];
}
export function assessCalibration(value, exitCode) {
  const fields = [
    'allocatedBytes',
    'beforeBytes',
    'heldBytes',
    'releasedBytes',
    'deltaBytes',
  ];
  if (
    value?.format !== 'clutter-phys-counter38' ||
    value.api !== 'proc_pid_rusage/RUSAGE_INFO_V4/ri_phys_footprint' ||
    value.units !== 'bytes' ||
    value.crossProcessRead !== true ||
    value.sameProcessIdentity !== true ||
    fields.some((k) => !Number.isSafeInteger(value[k]) || value[k] < 0) ||
    value.allocatedBytes !== 64 * 1024 * 1024 ||
    value.deltaBytes !== Math.max(0, value.heldBytes - value.beforeBytes) ||
    value.hostRanking !== 'not-qualified'
  )
    return 'inconclusive';
  return exitCode === 0 &&
    value.status === 'counter-change-observed' &&
    value.deltaBytes >= value.allocatedBytes * 0.75
    ? 'counter-sanity-pass'
    : 'inconclusive';
}
export function trialSizeDisposition(bytes, limitMiB) {
  if (
    !Number.isSafeInteger(bytes) ||
    bytes < 0 ||
    !Number.isFinite(limitMiB) ||
    limitMiB <= 0
  )
    throw Error('INVALID_SIZE_INPUT');
  return bytes <= limitMiB * 1024 * 1024
    ? 'within-trial-limit'
    : 'exceeds-trial-limit';
}
