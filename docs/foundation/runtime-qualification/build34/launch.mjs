// Launch one already-built candidate. Startup observations are NOT benchmark samples.
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  openSync,
  closeSync,
} from 'node:fs';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { sha, writeJson } from './projects.mjs';
import {
  launchArgs,
  completedCandidate,
  chooseGuiSession,
  nativeEvents,
} from './launch-model.mjs';
const source = dirname(fileURLToPath(import.meta.url)),
  root = resolve(source, '../../../..'),
  args = launchArgs(process.argv.slice(2));
if (
  execFileSync('git', ['branch', '--show-current'], {
    cwd: root,
    encoding: 'utf8',
  }).trim() !== 'architecture/clutter-foundation'
)
  throw Error('FOUNDATION_BRANCH_REQUIRED');
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  console.log(
    JSON.stringify({
      status: 'MAC_ARM64_REQUIRED',
      gui: 'not-run',
      performance: 'not-run',
    })
  );
  process.exitCode = 2;
} else await launch();
async function launch() {
  const gitPath = (p) =>
    resolve(
      root,
      execFileSync(
        'git',
        ['rev-parse', '--git-path', 'clutter-host-qualification/' + p],
        { cwd: root, encoding: 'utf8' }
      ).trim()
    );
  const pins = readFileSync(join(source, '../preflight-manifest.json')),
    runId = args['--run'],
    candidate = args['--candidate'];
  const { record } = completedCandidate(
    gitPath('builds'),
    runId,
    candidate,
    sha(pins)
  );
  const base = gitPath('gui/' + runId + '/' + candidate);
  mkdirSync(base, { recursive: true, mode: 0o700 });
  const latestFile = join(base, 'latest.json'),
    previous = existsSync(latestFile)
      ? JSON.parse(readFileSync(latestFile, 'utf8'))
      : null;
  if (
    previous &&
    (previous.runId !== runId ||
      previous.candidate !== candidate ||
      previous.bundle !== record.app ||
      previous.resources !== record.resources)
  )
    throw Error('GUI_SESSION_BINDING_MISMATCH');
  const live =
    previous?.uiPid && previous.privateBootFile
      ? spawnSync(
          '/bin/ps',
          ['-ww', '-p', String(previous.uiPid), '-o', 'command='],
          { encoding: 'utf8' }
        ).stdout?.includes(previous.privateBootFile)
      : false;
  if (previous?.status === 'launching-ui' && !previous.uiPid)
    throw Error('GUI_LIVENESS_UNKNOWN_NO_NEW_SPACE_CREATED');
  const reopen = chooseGuiSession(previous, args, live);
  // Never change a signed app. Bootstrap/report/locator are external private fixture state.
  execFileSync(
    '/usr/bin/codesign',
    ['--verify', '--deep', '--strict', record.app],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  const executableName = execFileSync(
    '/usr/libexec/PlistBuddy',
    [
      '-c',
      'Print :CFBundleExecutable',
      join(record.app, 'Contents/Info.plist'),
    ],
    { encoding: 'utf8' }
  ).trim();
  if (!/^[A-Za-z0-9._ -]+$/.test(executableName))
    throw Error('INVALID_APP_EXECUTABLE');
  const executable = join(record.app, 'Contents/MacOS', executableName);
  const launchId =
      new Date().toISOString().replace(/[:.]/g, '-') +
      '-' +
      randomUUID().slice(0, 8),
    directory = join(base, launchId);
  mkdirSync(directory, { mode: 0o700 });
  const reportFile = join(directory, 'launch-report.json'),
    eventsFile = join(directory, 'native-events.jsonl');
  const result = {
    format: 'clutter-host-gui37',
    runId,
    candidate,
    launchId,
    status: 'preparing',
    bundle: record.app,
    resources: record.resources,
    createdAt: new Date().toISOString(),
    performance: 'not-run',
    timingScope:
      'Operational readiness wait only; not cold-start/presentation benchmark',
    manualVisualCheck: 'not-run',
  };
  const checkpoint = () => {
    writeJson(reportFile, result);
    writeJson(latestFile, result);
  };
  if (previous) writeJson(join(directory, 'previous-locator.json'), previous);
  try {
    const env = {
      ...process.env,
      NODE_OPTIONS: '',
      NODE_PATH: '',
      PATH: '/usr/bin:/bin',
    };
    const command = [
      join(source, 'worker.mjs'),
      reopen ? 'reboot' : 'boot',
      record.resources,
      eventsFile,
      ...(reopen ? [reopen.session] : []),
    ];
    const boot = spawnSync(join(record.resources, 'runtime/node'), command, {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 45000,
      maxBuffer: 4 * 1024 * 1024,
    });
    writeFileSync(join(directory, 'bootstrap-log.txt'), boot.stderr ?? '', {
      mode: 0o600,
    });
    if (boot.status !== 0)
      throw Error('GUI_BOOTSTRAP_FAILED_SEE_BOOTSTRAP_LOG');
    const binding = JSON.parse(boot.stdout);
    if (candidate === 'H-E')
      mkdirSync(join(binding.session, 'electron-user-data'), {
        recursive: true,
        mode: 0o700,
      });
    Object.assign(result, {
      session: binding.session,
      spaceId: binding.spaceId,
      privateBootFile: binding.bootFile,
      reopened: !!reopen,
      status: 'launching-ui',
    });
    checkpoint();
    const fd = openSync(join(directory, 'native-stderr.txt'), 'a', 0o600);
    const child = spawn(executable, ['--host-config', binding.bootFile], {
      cwd: directory,
      env,
      detached: true,
      stdio: ['ignore', fd, fd],
    });
    closeSync(fd);
    let exited = false,
      failed = false;
    child.once('error', () => {
      failed = true;
    });
    child.once('exit', (code) => {
      exited = true;
      result.nativeExitCode = code;
    });
    result.uiPid = child.pid ?? null;
    checkpoint();
    child.unref();
    console.log(
      'Opening ' +
        candidate +
        ' only. Synthetic Space; other candidates/NC28 untouched.'
    );
    console.log(
      'Wait for Ready, then confirm both editor views show Alpha beta. Do not run other tests yet.'
    );
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const events = nativeEvents(eventsFile, candidate);
      result.nativeEvents = events;
      if (
        failed ||
        exited ||
        events.some((e) =>
          ['error', 'preload-failed', 'startup-failed'].includes(e.event)
        )
      ) {
        result.status = 'native-startup-failed';
        break;
      }
      if (events.some((e) => e.event === 'ready')) {
        result.status = 'ready-observed-via-native-adapter';
        break;
      }
      await new Promise((ok) => setTimeout(ok, 250));
    }
    if (result.status === 'launching-ui') result.status = 'ready-not-confirmed';
    checkpoint();
    console.log(
      JSON.stringify(
        {
          status: result.status,
          candidate,
          performance: 'not-run',
          visualCheck: 'user confirmation required',
          report: reportFile,
          reopen:
            'Repeat the same command with --reopen after closing; never --new to recover',
        },
        null,
        2
      )
    );
    if (result.status !== 'ready-observed-via-native-adapter')
      process.exitCode = 1;
  } catch (e) {
    result.status = 'launch-check-failed';
    result.error = e.message;
    checkpoint();
    throw e;
  }
}
