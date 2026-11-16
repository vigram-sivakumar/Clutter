import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  captureArgs,
  parseProcessList,
  selectProcesses,
} from '../instruments39/model.mjs';
import { completedCandidate } from '../build34/launch-model.mjs';
import { sha, writeJson } from '../build34/projects.mjs';
import { reuseGui } from './model.mjs';
const source = dirname(fileURLToPath(import.meta.url)),
  root = resolve(source, '../../../..'),
  args = captureArgs(process.argv.slice(2));
if (
  execFileSync('git', ['branch', '--show-current'], {
    cwd: root,
    encoding: 'utf8',
  }).trim() !== 'architecture/clutter-foundation'
)
  throw Error('FOUNDATION_BRANCH_REQUIRED');
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  console.log(
    JSON.stringify({ status: 'MAC_ARM64_REQUIRED', recording: 'not-run' })
  );
  process.exitCode = 2;
} else prepare();
function prepare() {
  const gitPath = (p) =>
      resolve(
        root,
        execFileSync(
          'git',
          ['rev-parse', '--git-path', 'clutter-host-qualification/' + p],
          { cwd: root, encoding: 'utf8' }
        ).trim()
      ),
    runId = args['--run'],
    candidate = args['--candidate'];
  const { record } = completedCandidate(
    gitPath('builds'),
    runId,
    candidate,
    sha(readFileSync(join(source, '../preflight-manifest.json')))
  );
  const locatorFile = gitPath(
    'gui/' + runId + '/' + candidate + '/latest.json'
  );
  let locator = JSON.parse(readFileSync(locatorFile, 'utf8'));
  if (
    locator.runId !== runId ||
    locator.candidate !== candidate ||
    locator.bundle !== record.app ||
    locator.resources !== record.resources
  )
    throw Error('GUI_BINDING_MISMATCH');
  const imageMatches = () => {
    try {
      selectProcesses(
        parseProcessList(
          execFileSync('/bin/ps', ['-ww', '-axo', 'pid=,ppid=,uid=,comm='], {
            encoding: 'utf8',
            timeout: 10000,
            maxBuffer: 8 * 1024 * 1024,
          })
        ),
        {
          app: record.app,
          resources: record.resources,
          uiPid: locator.uiPid,
          uid: process.getuid(),
        }
      );
      return true;
    } catch (e) {
      if (e.message === 'EXPECTED_UI_NOT_RUNNING') return false;
      throw e;
    }
  };
  const command = () =>
    Number.isSafeInteger(locator.uiPid)
      ? spawnSync(
          '/bin/ps',
          ['-ww', '-p', String(locator.uiPid), '-o', 'command='],
          { encoding: 'utf8', timeout: 5000 }
        ).stdout
      : '';
  const reuse = reuseGui(locator, command(), imageMatches());
  if (!reuse) {
    const p = spawnSync(
      process.execPath,
      [
        join(source, '../build34/launch.mjs'),
        '--run',
        runId,
        '--candidate',
        candidate,
        '--reopen',
      ],
      { cwd: root, stdio: 'inherit' }
    );
    if (p.status !== 0) throw Error('REOPEN_REFUSED_NO_NEW_SPACE');
    locator = JSON.parse(readFileSync(locatorFile, 'utf8'));
    if (!reuseGui(locator, command(), imageMatches()))
      throw Error('REOPEN_BINDING_NOT_LIVE');
  }
  execFileSync(
    '/usr/bin/codesign',
    ['--verify', '--deep', '--strict', record.app],
    { timeout: 15000, stdio: 'pipe' }
  );
  const id =
      new Date().toISOString().replace(/[:.]/g, '-') +
      '-' +
      randomUUID().slice(0, 8),
    folder = gitPath('manual44/' + id);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const contract = readFileSync(join(source, 'contract.json')),
    plan = {
      format: 'clutter-manual-plan44',
      id,
      runId,
      candidate,
      bundleSha256: record.bundleSha256,
      targetUiPid: locator.uiPid,
      contractSha256: sha(contract),
      tracePath: join(folder, 'manual.trace'),
      saveDirectory: folder,
      status: 'awaiting-manual-record-stop-save',
      recording: 'not-started-by-helper',
      measurement: 'not-qualified',
      reusedExistingWindow: reuse,
    };
  writeJson(join(folder, 'plan.json'), plan);
  const developer = execFileSync('/usr/bin/xcode-select', ['-p'], {
      encoding: 'utf8',
    }).trim(),
    instruments = resolve(developer, '../Applications/Instruments.app');
  if (!existsSync(instruments))
    throw Error('INSTRUMENTS_GUI_UNAVAILABLE_PLAN_RETAINED');
  const opened = spawnSync('/usr/bin/open', ['-a', instruments], {
    encoding: 'utf8',
    timeout: 10000,
  });
  console.log(
    JSON.stringify(
      {
        ...plan,
        instrumentsOpened: opened.status === 0,
        next: 'Choose Animation Hitches and target PID shown. Wait for instructions before recording; no CLI recording started.',
        validateCommand:
          'node docs/foundation/runtime-qualification/manual44/validate.mjs --plan ' +
          id,
      },
      null,
      2
    )
  );
}
