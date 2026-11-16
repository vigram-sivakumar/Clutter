// Diagnostic process-image matching only, never Space ownership or authentication.
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
function inspect(path) {
  const canonical = realpathSync(path),
    stat = statSync(path, { bigint: true });
  if (!stat.isFile() || stat.ino === 0n) throw Error('NOT_REGULAR_EXECUTABLE');
  return {
    canonical,
    key: [stat.dev, stat.ino, stat.size, stat.ctimeNs].join(':'),
  };
}
export function executableMatch(left, right) {
  if (
    typeof left !== 'string' ||
    typeof right !== 'string' ||
    !isAbsolute(left) ||
    !isAbsolute(right) ||
    left.includes('\0') ||
    right.includes('\0')
  )
    return { matches: false, method: 'invalid-path' };
  if (left === right) return { matches: true, method: 'exact-path' }; // Existing39 acceptance unchanged.
  try {
    const first = inspect(left),
      second = inspect(right),
      leftAgain = inspect(left),
      rightAgain = inspect(right);
    const stable =
      first.canonical === leftAgain.canonical &&
      second.canonical === rightAgain.canonical &&
      first.key === leftAgain.key &&
      second.key === rightAgain.key;
    if (!stable) return { matches: false, method: 'changed-file-identity' };
    return first.canonical === second.canonical && first.key === second.key
      ? { matches: true, method: 'canonical-file-identity' }
      : { matches: false, method: 'different-file-identity' };
  } catch (e) {
    return {
      matches: false,
      method: 'file-identity-unavailable',
      ...(typeof e.code === 'string' &&
      ['ENOENT', 'EACCES', 'EPERM', 'ENOTDIR', 'ELOOP'].includes(e.code)
        ? { errorCode: e.code }
        : {}),
    };
  }
}
