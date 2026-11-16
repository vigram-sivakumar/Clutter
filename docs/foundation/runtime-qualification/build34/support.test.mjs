import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtempSync, rmSync, readFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { bootstrap, decodeEvent } from './bootstrap.mjs';
import {
  checksumEntry,
  safeArchiveNames,
  tauriProject,
  tree,
  graphSourceHashes,
} from './projects.mjs';
const source = dirname(fileURLToPath(import.meta.url));
const ui = {
  url: 'http://127.0.0.1:23456',
  token: 'fixture-private-ui-token',
  spaceId: 'fixture-space',
  png: '',
  pngAlt: '',
  pdf: '',
};
function browser(origin = ui.url) {
  const events = [],
    status = { textContent: '' };
  const location = {
    origin,
    pathname: '/',
    set href(v) {
      events.push(v);
    },
  };
  const sandbox = { location, document: { querySelector: () => status } };
  vm.createContext(sandbox);
  vm.runInContext(bootstrap(ui, 'nonce'), sandbox);
  return { sandbox, events, status };
}
test('origin-bound shell bootstrap exposes only UI data and finite host events', () => {
  const b = browser();
  assert.equal(b.sandbox.__clutterCore28Bootstrap.token, ui.token);
  b.sandbox.__clutterHostEvent({
    action: 'ready',
    capture: { ignored: 'not sent' },
  });
  assert.deepEqual(decodeEvent(b.events[0], 'nonce'), {
    event: 'ready',
    bootNonce: 'nonce',
  });
  assert.ok(!b.events[0].includes(ui.token));
  assert.equal(b.sandbox.require, undefined);
  assert.equal(
    browser('https://wrong.invalid').sandbox.__clutterCore28Bootstrap,
    undefined
  );
  b.sandbox.__clutterHostEvent({ action: 'pdf', payload: 'not-exported' });
  assert.match(b.status.textContent, /not included/);
  assert.equal(decodeEvent(b.events[1], 'nonce').event, 'pdf-not-qualified');
});
test('close bridge calls shared prepareClose and carries challenge; failures stay unsafe', async () => {
  const b = browser();
  let called = 0;
  b.sandbox.lab28 = {
    prepareClose: async () => {
      called++;
      return { safe: true };
    },
  };
  await b.sandbox.__host34Close('guard1');
  assert.equal(called, 1);
  assert.deepEqual(decodeEvent(b.events[0], 'nonce'), {
    event: 'close',
    guardNonce: 'guard1',
    safe: true,
    bootNonce: 'nonce',
  });
  b.sandbox.lab28.prepareClose = async () => {
    throw Error('protection failed');
  };
  await b.sandbox.__host34Close('guard2');
  assert.equal(decodeEvent(b.events[1], 'nonce').safe, false);
});
test('host event decoder refuses another boot, scheme, or malformed close result', () => {
  const addr = (m) =>
    'clutter-host34://event/?m=' + encodeURIComponent(JSON.stringify(m));
  assert.equal(
    decodeEvent(addr({ event: 'ready', bootNonce: 'old' }), 'nonce'),
    null
  );
  assert.equal(
    decodeEvent(
      addr({ event: 'close', bootNonce: 'nonce', safe: true }),
      'nonce'
    ),
    null
  );
  assert.equal(decodeEvent('https://evil.invalid/?m=x', 'nonce'), null);
  assert.equal(
    decodeEvent(
      addr({ event: 'arbitrary-shell', bootNonce: 'nonce' }),
      'nonce'
    ),
    null
  );
});
test('download admission requires one exact upstream checksum and contained archive names', () => {
  const hash = 'a'.repeat(64);
  assert.equal(checksumEntry(hash + ' *exact.zip\n', 'exact.zip'), hash);
  assert.throws(() => checksumEntry(hash + ' wrong.zip', 'exact.zip'));
  assert.throws(() =>
    checksumEntry(hash + ' exact.zip\n' + hash + ' exact.zip', 'exact.zip')
  );
  assert.throws(() => safeArchiveNames('safe/file\n../escape'));
  assert.throws(() => safeArchiveNames('/absolute'));
  safeArchiveNames('Electron.app/Contents/Info.plist\nLICENSE');
});
test('Tauri project generation pins versions in an isolated project with no renderer permissions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'h34-project-'));
  try {
    tauriProject(
      dir,
      { tauriNpmCli: '2.12.4', tauriCrate: '2.12.5', tauriBuildCrate: '2.7.4' },
      source
    );
    const config = JSON.parse(
      readFileSync(join(dir, 'src-tauri/tauri.conf.json'))
    );
    assert.deepEqual(config.app.security.capabilities, []);
    assert.deepEqual(config.app.windows, []);
    assert.equal(config.app.withGlobalTauri, false);
    assert.match(
      readFileSync(join(dir, 'src-tauri/Cargo.toml'), 'utf8'),
      /tauri = "=2.12.5"/
    );
    assert.equal(
      JSON.parse(readFileSync(join(dir, 'package.json'))).dependencies[
        '@tauri-apps/cli'
      ],
      '2.12.4'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('actual copied common Core supports packaged CLI/MCP same-head smoke without GUI/user PATH', () => {
  const dir = mkdtempSync(join(tmpdir(), 'h34-common-')),
    a = join(dir, 'A'),
    b = join(dir, 'B');
  const worker = (mode, target, extra = '') => {
    const p = spawnSync(
      process.execPath,
      [join(source, 'worker.mjs'), mode, target, extra],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 }
    );
    assert.equal(p.status, 0, p.stderr);
    return p.stdout.trim();
  };
  const sessions = [];
  try {
    worker('pack', a, join(dir, 'graphs.json'));
    const hashes = graphSourceHashes(
      JSON.parse(readFileSync(join(dir, 'graphs.json'))),
      process.cwd()
    );
    assert.ok(Object.keys(hashes).length > 10);
    worker('manifest', a);
    cpSync(a, b, { recursive: true });
    assert.equal(tree(a).sha256, tree(b).sha256);
    for (const target of [a, b]) {
      const r = JSON.parse(worker('smoke', target));
      sessions.push(r.session);
      assert.equal(r.ok, true);
      assert.equal(r.cliAndMcpSameHead, true);
      assert.equal(r.profile.node, process.version);
    }
    assert.notEqual(sessions[0], sessions[1]);
  } finally {
    for (const session of sessions) {
      try {
        const meta = JSON.parse(readFileSync(join(session, 'session.json')));
        rmSync(meta.vaultDir, { recursive: true, force: true });
        rmSync(session, { recursive: true, force: true });
      } catch {}
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
test(
  'Linux build invocation is explicitly not a Mac compile or performance pass',
  { skip: process.platform === 'darwin' },
  () => {
    const p = spawnSync(process.execPath, [join(source, 'run.mjs')], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(p.status, 2, p.stderr);
    const r = JSON.parse(p.stdout);
    assert.equal(r.status, 'MAC_ARM64_REQUIRED');
    assert.equal(r.builds, 'not-run');
    assert.equal(r.performance, 'not-run');
  }
);
