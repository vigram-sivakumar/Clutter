// Recovery only: use the existing bundle/session, never run the new-space builder.
import { readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export function inspectCurrent(setupPath) {
  const bytes = readFileSync(setupPath);
  if (bytes.length > 4 * 1024 * 1024) throw Error('SETUP_TOO_LARGE');
  const s = JSON.parse(bytes);
  if (
    !isAbsolute(s.bundle ?? '') ||
    !isAbsolute(s.session ?? '') ||
    !s.bundle.endsWith('.app')
  )
    throw Error('NO_EXISTING_SESSION_IN_SETUP');
  for (const path of [
    join(s.session, 'session.json'),
    join(s.session, 'store', 'EXPERIMENT-ONLY'),
    join(s.session, 'store', 'vault.sqlite'),
  ]) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw Error('EXISTING_STORE_REQUIRED_NO_RESET');
  }
  const resources = join(s.bundle, 'Contents/Resources'),
    node = join(resources, 'runtime/node'),
    launcher = join(resources, 'launcher.mjs');
  const call = (method) => {
    const value = JSON.parse(
      execFileSync(node, [launcher, '--session', s.session], {
        input: JSON.stringify({ method }),
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, PATH: '/usr/bin:/bin' },
      })
    );
    if (!value.ok) throw Error(value.error ?? 'EXISTING_SESSION_READ_FAILED');
    return value.result;
  };
  const root = call('read'),
    recovery = call('list_recovery');
  if (
    s.headless?.owner &&
    (root.spaceId !== s.headless.owner.spaceId ||
      root.documentId !== s.headless.owner.documentId)
  )
    throw Error('SAVED_SESSION_IDENTITY_MISMATCH');
  return { setup: s, root, recovery, resources };
}
export function reopenCurrent(setupPath, { openWindow = true } = {}) {
  const { setup, root, recovery } = inspectCurrent(setupPath);
  const artifacts = resolve(setupPath, '..');
  mkdirSync(artifacts, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-'),
    report = join(artifacts, 'joined-native-reopened-' + stamp + '.json');
  const diagnostic = {
    format: 'clutter-same-session-reopen-v1',
    savedSpaceId: root.spaceId,
    documentId: root.documentId,
    revision: root.version,
    canonicalDoc: root.state.doc,
    protected: recovery.map((r) => ({
      contextId: r.context_id,
      generation: r.generation,
      baseVersion: r.base_version,
      liveOwned: r.liveOwned,
      doc: r.state.doc,
    })),
    newNativeReport: report,
    requestedOriginalBundleLaunch: openWindow,
    limits: [
      'No reset/new Space or automatic restore.',
      'Unprotected in-memory typing lost during an already completed reload cannot be reconstructed by this tool.',
      'Original bundled app is reused for recovery; avoid another reload until the fixed host is rebuilt.',
    ],
  };
  if (setup.report) {
    try {
      const raw = readFileSync(setup.report);
      if (raw.length <= 16 * 1024 * 1024)
        diagnostic.lastRecordedCapture = JSON.parse(raw).latestCapture ?? {};
    } catch {
      diagnostic.lastRecordedCaptureUnavailable = true;
    }
  }
  const path = join(artifacts, 'joined-native-recovery-' + stamp + '.json');
  writeFileSync(path, JSON.stringify(diagnostic, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  if (openWindow) {
    const child = spawn(
      join(setup.bundle, 'Contents/MacOS/ClutterJoinedLab'),
      ['--session', setup.session, '--report', report],
      { detached: true, stdio: 'ignore' }
    );
    child.once('error', (e) => {
      console.error('Could not reopen original app:', e.message);
      process.exitCode = 1;
    });
    child.unref();
  }
  return {
    spaceId: root.spaceId,
    revision: root.version,
    protectedContexts: diagnostic.protected.map((r) => r.contextId),
    diagnostic: path,
    newNativeReport: report,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const setup =
      process.argv.slice(2).find((a) => a !== '--inspect-only') ??
      resolve('artifacts/joined-native-setup.json');
    const result = reopenCurrent(setup, {
      openWindow: !process.argv.includes('--inspect-only'),
    });
    console.log(JSON.stringify(result, null, 2));
    console.log(
      'Original saved session selected. No new Space or automatic content restore.'
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
