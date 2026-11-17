import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { inventory } from './audit.mjs';
import { collectNativeLocks } from './export-native-locks.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const put = (p, s) => {
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, s);
};
test('inventory follows alias/type-only/dynamic imports and excludes implementation tests', () => {
  const root = mkdtempSync(join(tmpdir(), 'clutter-inventory51-'));
  try {
    put(
      join(root, 'apps/app/src/components/button/Button.tsx'),
      "import type { Shape } from '@shared/shape'; import('missing-external'); export const Button=1;"
    );
    put(
      join(root, 'apps/app/src/shared/shape.ts'),
      "export {x} from '@core/old';"
    );
    put(
      join(root, 'apps/app/src/core/old.ts'),
      "import '@tauri-apps/api/core'; export const x=1;"
    );
    put(
      join(root, 'apps/app/src/components/button/Button.test.tsx'),
      "import '@codemirror/view';"
    );
    const r = inventory(root),
      button = r.representativeRoots.find((x) => x.file.endsWith('Button.tsx'));
    assert.deepEqual(button.structuralCoupling, ['legacy-core', 'platform']);
    assert.equal(r.counts.productionSourceFiles, 3);
    assert.equal(r.counts.testSourceFiles, 1);
    assert.equal(r.counts.unresolvedLocalImports, 0);
    assert.equal(button.shortestExamplePaths['legacy-core'].length, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('native lock export selects only dependency files and rejects changed lock bytes', () => {
  const git = mkdtempSync(join(tmpdir(), 'clutter-lock-export51-'));
  try {
    const base = join(git, 'clutter-foundation48'),
      build = join(base, 'builds', '2026-11-16T16-56-32-816Z'),
      app = join(build, 'Clutter Foundation.app');
    mkdirSync(app, { recursive: true });
    const pkg = JSON.stringify({
        dependencies: { '@tauri-apps/cli': '2.12.4' },
      }),
      npm = JSON.stringify({ lockfileVersion: 3 }),
      cargo = 'version = 4\n';
    put(
      join(base, 'latest.json'),
      JSON.stringify({ app, session: 'DO_NOT_EXPORT' })
    );
    put(
      join(build, 'build-report.json'),
      JSON.stringify({
        status: 'built-signed-not-native-qualified',
        dependencyProvenance: {
          privateField: 'DO_NOT_EXPORT',
          cargoSha256: sha(cargo),
          npmSha256: sha(npm),
        },
      })
    );
    for (const [name, data] of Object.entries({
      'package.json': pkg,
      'package-lock.json': npm,
      'src-tauri/Cargo.toml': '[package]\n',
      'src-tauri/Cargo.lock': cargo,
    }))
      put(join(build, 'project', name), data);
    put(join(base, 'host-secret.json'), 'DO_NOT_EXPORT');
    const files = collectNativeLocks(git);
    assert.deepEqual(Object.keys(files).sort(), [
      'Cargo.lock',
      'Cargo.toml',
      'native-tools.package-lock.json',
      'native-tools.package.json',
      'provenance.json',
    ]);
    for (const data of Object.values(files))
      assert(!data.toString().includes('DO_NOT_EXPORT'));
    assert.equal(
      readFileSync(join(base, 'latest.json'), 'utf8'),
      JSON.stringify({ app, session: 'DO_NOT_EXPORT' })
    );
    writeFileSync(join(build, 'project/src-tauri/Cargo.lock'), 'changed');
    assert.throws(
      () => collectNativeLocks(git),
      /GENERATED_LOCK_DIGEST_MISMATCH/
    );
  } finally {
    rmSync(git, { recursive: true, force: true });
  }
});
