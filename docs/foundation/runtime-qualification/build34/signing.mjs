// Ad-hoc qualification only. Explicit nested code order; strict verification stays separate.
import {
  readdirSync,
  lstatSync,
  realpathSync,
  openSync,
  readSync,
  closeSync,
  existsSync,
} from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
const magic = new Set([
  'feedface',
  'feedfacf',
  'cefaedfe',
  'cffaedfe',
  'cafebabe',
  'bebafeca',
  'cafebabf',
  'bfbafeca',
]);
function macho(path) {
  const fd = openSync(path, 'r');
  try {
    const b = Buffer.alloc(4);
    return readSync(fd, b, 0, 4, 0) === 4 && magic.has(b.toString('hex'));
  } finally {
    closeSync(fd);
  }
}
export function nestedSigningPlan(app) {
  const root = resolve(app, 'Contents/Frameworks');
  if (!existsSync(root)) return [];
  const leaves = [],
    containers = [];
  function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name),
        s = lstatSync(path);
      if (s.isSymbolicLink()) {
        const target = realpathSync(path);
        if (target !== root && !target.startsWith(root + sep))
          throw Error('NESTED_CODE_SYMLINK_ESCAPES');
        continue;
      }
      if (s.isDirectory()) {
        walk(path);
        if (/\.(framework|app|xpc|bundle)$/.test(name)) {
          if (
            name.endsWith('.framework') &&
            existsSync(join(path, 'Versions'))
          ) {
            const versions = readdirSync(join(path, 'Versions')).filter((v) =>
              lstatSync(join(path, 'Versions', v)).isDirectory()
            );
            if (versions.length !== 1)
              throw Error('FRAMEWORK_VERSION_LAYOUT_REQUIRES_REVIEW');
          }
          containers.push(path);
        }
      } else if (s.isFile() && macho(path)) leaves.push(path);
    }
  }
  walk(root);
  const deepest = (a, b) =>
    b.split(sep).length - a.split(sep).length || a.localeCompare(b);
  return [
    ...leaves.sort(deepest).map((path) => ({ path, kind: 'mach-o' })),
    ...containers
      .filter((path) => leaves.some((leaf) => leaf.startsWith(path + sep)))
      .sort(deepest)
      .map((path) => ({ path, kind: 'bundle' })),
  ];
}
export function signArguments(path, { outer = false } = {}) {
  return [
    '--force',
    '--sign',
    '-',
    '--preserve-metadata=' +
      (outer ? 'entitlements,flags' : 'entitlements,flags,identifier'),
    path,
  ];
}
