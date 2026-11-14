import assert from 'node:assert/strict';
import {
  mkdtempSync,
  realpathSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { reopenCurrent } from '../joined-native/reopen-current.mjs';
import { packResources, finishManifest } from '../joined-native/pack.mjs';
import {
  createSession,
  readPrivate,
  checkDescriptor,
  bundleIdentity,
  checkSession,
} from '../joined-native/private-session.mjs';
import { preflight } from '../joined-native/preflight.mjs';
import { verifyArchive, lock } from '../joined-native/runtime.mjs';
import { runCli, headlessSmoke } from '../joined-native/smoke.mjs';
const results = [],
  base = mkdtempSync(join(realpathSync(tmpdir()), 'cj16-test-')),
  session = join(base, 's');
let resources, descriptor, browser, page;
const output =
  process.env.JOINED_NATIVE_RESULT ?? 'artifacts/joined-native-linux.json';
async function check(id, title, f) {
  try {
    const detail = await f();
    results.push({ id, title, status: 'pass', detail });
    console.log(id + ' pass ' + title);
  } catch (e) {
    results.push({ id, title, status: 'fail', error: e.stack });
    throw e;
  }
}
async function command(c, args = []) {
  return runCli(resources, session, c, args);
}
async function readDescriptor() {
  return readPrivate(join(session, 'endpoint.json'));
}
try {
  await check(
    'NP-01',
    'Unsupported host and runtime integrity fail closed',
    async () => {
      assert.equal(preflight({ platform: 'linux' }).ready, false);
      const p = spawnSync(
        process.execPath,
        ['joined-native/run.mjs', '--check'],
        { encoding: 'utf8' }
      );
      assert.equal(p.status, process.platform === 'darwin' ? 0 : 2);
      assert.throws(
        () => verifyArchive(Buffer.from('damaged archive'), 'arm64'),
        /CHECKSUM/
      );
      assert.equal(Object.keys(lock.archives).length, 2);
      return {
        host: process.platform,
        nativeAcceptance: 'not-run',
        checksumNegative: true,
      };
    }
  );
  await check(
    'NP-02',
    'Private marked session and descriptor validation',
    async () => {
      createSession(session);
      const file = join(session, 'unsafe.json');
      writeFileSync(file, '{}', { mode: 0o644 });
      assert.throws(() => readPrivate(file), /UNSAFE/);
      chmodSync(file, 0o600);
      const link = join(session, 'link.json');
      symlinkSync(file, link);
      assert.throws(() => readPrivate(link), /UNSAFE/);
      assert.equal(checkSession(session).path, session);
      return { wrongModeDenied: true, symlinkDenied: true };
    }
  );
  await check(
    'NP-03',
    'Packed runtime and app-closed CLI/MCP single owner',
    async () => {
      resources = join(base, 'Bundle with spaces.app', 'Contents', 'Resources');
      await packResources(resources, process.execPath);
      finishManifest(resources, {
        testProfile: 'Linux node copy; not downloaded Mac archive or Swift app',
      });
      const report = await headlessSmoke(resources, session);
      const wrapped = join(resources, 'bin/clutter-lab');
      const wrappedRead = spawnSync(wrapped, ['--session', session], {
        input: '{"method":"read"}',
        env: { ...process.env, PATH: '/usr/bin:/bin' },
        encoding: 'utf8',
        timeout: 25000,
      });
      assert.equal(
        wrappedRead.status,
        0,
        wrappedRead.stderr + wrappedRead.stdout
      );
      assert.equal(JSON.parse(wrappedRead.stdout).ok, true);
      descriptor = await readDescriptor();
      assert.equal(descriptor.profile.nativeFullSyncRequired, false);
      assert.throws(
        () =>
          checkDescriptor(
            { ...descriptor, bundleId: 'other' },
            checkSession(session),
            bundleIdentity(resources)
          ),
        /INVALID/
      );
      return { ...report, profile: descriptor.profile };
    }
  );
  await check(
    'NP-04',
    'Actual editors block close on failed protection',
    async () => {
      browser = await chromium.launch({
        headless: true,
        ...(process.env.CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
          : {}),
        args: process.platform === 'linux' ? ['--no-sandbox'] : [],
      });
      page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(
        descriptor.url.replace('/rpc', '/') +
          '#' +
          encodeURIComponent(JSON.stringify(descriptor))
      );
      await page.waitForFunction(() => !!window.joinedNative);
      const presentation = await page.evaluate(() => ({
        panes: getComputedStyle(document.querySelector('.panes')).display,
        border: getComputedStyle(document.querySelector('.ProseMirror td'))
          .borderTopStyle,
        editorBorder: getComputedStyle(document.querySelector('.ProseMirror'))
          .borderTopStyle,
        sameRow:
          Math.abs(
            document.querySelector('#origin-a').getBoundingClientRect().top -
              document.querySelector('#origin-b').getBoundingClientRect().top
          ) < 2,
      }));
      assert.equal(presentation.panes, 'grid');
      assert.equal(presentation.border, 'solid');
      assert.equal(presentation.editorBorder, 'solid');
      assert.equal(presentation.sameRow, true);

      await page.evaluate(() => {
        window.originLab.pause('A');
        window.originLab.select('A', 'Alpha');
        window.originLab
          .view('A')
          .dispatch(
            window.originLab.view('A').state.tr.insertText('QUIT-PROTECTED ')
          );
      });
      await command({}, ['--control', 'fail_protection', 'true']);
      const error = await page.evaluate(async () => {
        try {
          await window.joinedNative.prepareClose(false);
          return null;
        } catch (e) {
          return e.message;
        }
      });
      assert.equal(error, 'INJECTED_SAVE_FAILURE');
      assert.equal(
        await page.evaluate(() => window.originLab.view('A').editable),
        true
      );
      await command({}, ['--control', 'fail_protection', 'false']);
      const protectedResult = await page.evaluate(() =>
        window.joinedNative.prepareClose(false)
      );
      assert.deepEqual(protectedResult.protectedContexts, ['A']);
      assert.equal(
        (await command({ method: 'list_recovery' })).result[0].liveOwned,
        true
      );
      await page.evaluate(() => window.joinedNative.reopen());
      assert.equal(
        await page.evaluate(() => window.originLab.view('A').editable),
        true
      );
      assert.deepEqual(errors, []);
      return {
        helperRoute:
          'Chromium JS used by Swift close delegate; not native close itself',
        protectionFailureBlocks: true,
      };
    }
  );
  await check(
    'NP-05',
    'Context release permits recovery while owner stays alive',
    async () => {
      const epoch = descriptor.ownerEpoch;
      await page.evaluate(() => window.joinedNative.prepareClose(true));
      await page.close();
      const list = (await command({ method: 'list_recovery' })).result;
      assert.equal(list[0].liveOwned, false);
      const root = (await command({ method: 'read' })).result;
      assert.equal(root.ownerEpoch, epoch);
      const restored = await command({
        method: 'restore_protection',
        operationId: randomUUID(),
        expectedVersion: root.version,
        contextId: 'A',
        generation: list[0].generation,
      });
      assert.equal(restored.result.status, 'applied');
      const current = (await command({ method: 'read' })).result;
      assert.match(JSON.stringify(current.state.doc), /QUIT-PROTECTED/);
      assert.equal(current.ownerEpoch, epoch);
      return {
        ownerSurvivesClientClosure: true,
        explicitContextHandoff: true,
        restoredVersion: current.version,
      };
    }
  );
  await check(
    'NP-06',
    'Crash restarts from same fenced store with rotated capability',
    async () => {
      const old = descriptor;
      await command({}, ['--control', 'crash']);
      const root = (await command({ method: 'read' })).result;
      descriptor = await readDescriptor();
      assert.notEqual(root.ownerEpoch, old.ownerEpoch);
      assert.equal(root.spaceId, old.spaceId);
      assert.match(JSON.stringify(root.state.doc), /QUIT-PROTECTED/);
      assert.equal(descriptor.url, old.url);
      const response = await fetch(old.url, {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + old.token,
          'content-type': 'application/json',
        },
        body: '{}',
      });
      assert.equal(response.status, 403);
      return { sameRoot: true, rotatedEpoch: true, oldTokenDenied: true };
    }
  );
  await check(
    'NP-07',
    'Bundle mismatch cannot launch alternate writer',
    async () => {
      const owner = join(resources, 'owner.mjs'),
        original = readFileSync(owner);
      writeFileSync(
        owner,
        Buffer.concat([original, Buffer.from('\n// tampered')])
      );
      try {
        const p = spawnSync(
          join(resources, 'runtime/node'),
          [join(resources, 'launcher.mjs'), '--session', session],
          { input: '{"method":"read"}', encoding: 'utf8', timeout: 15000 }
        );
        assert.notEqual(p.status, 0);
        assert.match(p.stdout, /BUNDLE_CHANGED/);
      } finally {
        writeFileSync(owner, original);
      }
      return { mismatchedComponentsDenied: true };
    }
  );
  await check(
    'NP-08',
    'Writer drains when its supervisor IPC disappears',
    async () => {
      const dir = join(base, 'supervisor-loss-store');
      const p = spawn(
        join(resources, 'runtime/node'),
        [join(resources, 'owner.mjs'), '--store', dir, '--init'],
        { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }
      );
      let timer;
      try {
        await Promise.race([
          new Promise((resolve, reject) => {
            p.on('message', (m) =>
              m.type === 'ready'
                ? resolve()
                : m.type === 'startup_error'
                  ? reject(Error(m.error))
                  : null
            );
            p.once('error', reject);
          }),
          new Promise(
            (_, reject) =>
              (timer = setTimeout(
                () => reject(Error('SUPERVISOR_READY_TIMEOUT')),
                10000
              ))
          ),
        ]);
        clearTimeout(timer);
        const exit = once(p, 'exit');
        p.disconnect();
        await Promise.race([
          exit,
          new Promise(
            (_, reject) =>
              (timer = setTimeout(
                () => reject(Error('SUPERVISOR_EXIT_TIMEOUT')),
                10000
              ))
          ),
        ]);
        return {
          unexpectedSupervisorLossDrainsWriter: true,
          desktopClosureStillIndependent: true,
        };
      } finally {
        clearTimeout(timer);
        if (p.exitCode === null) p.kill('SIGKILL');
      }
    }
  );
  await check(
    'NP-09',
    'Reload bootstrap restores committed state and protected drafts',
    async () => {
      descriptor = await readDescriptor();
      const bad = await browser.newPage();
      const badErrors = [];
      bad.on('pageerror', (e) => badErrors.push(e.message));
      await bad.goto(
        descriptor.url.replace('/rpc', '/') +
          '#' +
          encodeURIComponent(JSON.stringify(descriptor))
      );
      await bad.waitForFunction(() => !!window.joinedNative);
      const before = (await command({ method: 'read' })).result;
      await bad.reload();
      await bad.waitForFunction(() => !window.joinedNative);
      assert.equal(
        (await command({ method: 'read' })).result.version,
        before.version
      );
      assert.deepEqual(
        (await command({ method: 'read' })).result.state.doc,
        before.state.doc
      );
      assert.ok(badErrors.some((e) => e.includes('MISSING_BOOTSTRAP')));
      await bad.close();
      const bootstrap = Object.fromEntries(
        ['url', 'token', 'editorGrants', 'spaceId', 'documentId'].map((k) => [
          k,
          descriptor[k],
        ])
      );
      const script = readFileSync('joined-native/bootstrap.js', 'utf8').replace(
        '__CLUTTER_NATIVE_BOOTSTRAP__',
        JSON.stringify(bootstrap)
      );
      const good = await browser.newPage();
      const errors = [];
      good.on('pageerror', (e) => errors.push(e.message));
      await good.addInitScript({ content: script });
      await good.goto(descriptor.url.replace('/rpc', '/'));
      await good.waitForFunction(() => !!window.joinedNative);
      await good.evaluate(() => {
        window.originLab.select('A', 'Alpha');
        window.originLab
          .view('A')
          .dispatch(
            window.originLab.view('A').state.tr.insertText('RELOAD-SAVED ')
          );
      });
      await good.evaluate(() => window.joined.settle());
      const saved = (await command({ method: 'read' })).result;
      await good.reload();
      await good.waitForFunction(() => !!window.joinedNative);
      assert.match(
        JSON.stringify(
          await good.evaluate(() => window.originLab.snapshot().doc)
        ),
        /RELOAD-SAVED/
      );
      assert.equal(
        (await command({ method: 'read' })).result.version,
        saved.version
      );
      assert.equal(
        await good.evaluate(() => Object.hasOwn(window, '__clutterBootstrap')),
        false
      );
      assert.equal(await good.evaluate(() => location.hash), '');
      assert.equal(
        await good.evaluate(() => sessionStorage.length + localStorage.length),
        0
      );
      await good.evaluate(() => {
        window.originLab.pause('A');
        window.originLab.select('A', 'Alpha');
        window.originLab
          .view('A')
          .dispatch(
            window.originLab.view('A').state.tr.insertText('RELOAD-PENDING ')
          );
      });
      await command({}, ['--control', 'fail_protection', 'true']);
      assert.equal(
        await good.evaluate(async () => {
          try {
            await window.joinedNative.prepareClose(true);
            return 'bad';
          } catch (e) {
            return e.message;
          }
        }),
        'INJECTED_SAVE_FAILURE'
      );
      await command({}, ['--control', 'fail_protection', 'false']);
      await good.evaluate(() => window.joinedNative.prepareClose(true));
      await good.reload();
      await good.waitForFunction(
        () =>
          !!window.joinedNative &&
          !!document.querySelector('#protected-recovery-notice')
      );
      assert.match(
        JSON.stringify((await command({ method: 'list_recovery' })).result),
        /RELOAD-PENDING/
      );
      await good.evaluate(() => window.joinedNative.recover('A'));
      assert.match(
        JSON.stringify(
          await good.evaluate(() => window.originLab.snapshot().doc)
        ),
        /RELOAD-PENDING/
      );
      assert.deepEqual(errors, []);
      await good.close();
      return {
        missingFragmentReproduced: true,
        canonicalRootUnaffectedByFailedBootstrap: true,
        inMemoryBootstrapReload: true,
        credentialsNotStored: true,
        guardHelperPreservesPending: true,
        nativeNavigationDelegate:
          'prepared; actual WK reload requires Mac test',
      };
    }
  );
  await check(
    'NP-10',
    'Same-session recovery helper cannot create a new Space',
    async () => {
      const fakeBundle = resolve(resources, '../..');
      const setupPath = join(base, 'setup.json');
      writeFileSync(
        setupPath,
        JSON.stringify({
          bundle: fakeBundle,
          session,
          report: join(base, 'missing-native-report.json'),
        })
      );
      const before = (await command({ method: 'read' })).result;
      writeFileSync(
        setupPath,
        JSON.stringify({
          bundle: fakeBundle,
          session,
          headless: {
            owner: { spaceId: before.spaceId, documentId: before.documentId },
          },
        })
      );
      const result = reopenCurrent(setupPath, { openWindow: false });
      assert.equal(result.spaceId, before.spaceId);
      assert.equal(result.revision, before.version);
      const after = (await command({ method: 'read' })).result;
      assert.deepEqual(after.state.doc, before.state.doc);
      assert.equal(after.version, before.version);
      writeFileSync(
        setupPath,
        JSON.stringify({
          bundle: fakeBundle,
          session,
          headless: {
            owner: { spaceId: 'wrong', documentId: before.documentId },
          },
        })
      );
      assert.throws(
        () => reopenCurrent(setupPath, { openWindow: false }),
        /IDENTITY_MISMATCH/
      );
      writeFileSync(
        setupPath,
        JSON.stringify({
          bundle: fakeBundle,
          session: join(base, 'missing-session'),
        })
      );
      assert.throws(() => reopenCurrent(setupPath, { openWindow: false }));
      return {
        sameSpaceReadOnly: true,
        recordedDiagnosticWithoutCredentials: true,
        nativeWindowLaunch: 'not-run on Linux',
      };
    }
  );
} catch (e) {
  process.exitCode = 1;
  console.error(e.stack);
} finally {
  await browser?.close();
  if (resources && descriptor)
    try {
      await command({}, ['--control', 'stop']);
    } catch {}
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(
    output,
    JSON.stringify(
      {
        date: '2026-11-14',
        scope:
          'Linux packaged-process/bootstrap/context-handoff helper proof. No Swift/macOS/native/signing/runtime-archive execution claimed.',
        results,
        native: 'not-run',
        sourceProfile:
          'prepared Mac runtime is independently checksum-pinned; this test copies actual current Linux Node',
      },
      null,
      2
    ) + '\n'
  );
  console.log('Report ' + output);
}
