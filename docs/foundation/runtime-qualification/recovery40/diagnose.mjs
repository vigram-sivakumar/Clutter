// One diagnostic snapshot only: no recording, launch, recovery, endpoint or vault access.
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { sha, writeJson } from '../build34/projects.mjs';
import { completedCandidate } from '../build34/launch-model.mjs';
import {
  captureArgs,
  parseProcessList,
  selectProcesses,
  sanitizeSample,
} from '../instruments39/model.mjs';
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
    JSON.stringify({ status: 'MAC_ARM64_REQUIRED', trace: 'not-run' })
  );
  process.exitCode = 2;
} else diagnose();
function diagnose() {
  const gitPath = (p) =>
      resolve(
        root,
        execFileSync(
          'git',
          ['rev-parse', '--git-path', 'clutter-host-qualification/' + p],
          { cwd: root, encoding: 'utf8' }
        ).trim()
      ),
    id = args['--run'],
    candidate = args['--candidate'];
  const { record } = completedCandidate(
    gitPath('builds'),
    id,
    candidate,
    sha(readFileSync(join(source, '../preflight-manifest.json')))
  );
  const locator = JSON.parse(
    readFileSync(
      gitPath('gui/' + id + '/' + candidate + '/latest.json'),
      'utf8'
    )
  );
  if (
    locator.runId !== id ||
    locator.candidate !== candidate ||
    locator.bundle !== record.app ||
    locator.resources !== record.resources ||
    !Number.isSafeInteger(locator.uiPid)
  )
    throw Error('GUI_BINDING_MISMATCH');
  const list = () =>
    parseProcessList(
      execFileSync('/bin/ps', ['-ww', '-axo', 'pid=,ppid=,uid=,comm='], {
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
        timeout: 10000,
      })
    );
  const choose = (rows) =>
    selectProcesses(rows, {
      app: record.app,
      resources: record.resources,
      uiPid: locator.uiPid,
      uid: process.getuid(),
    });
  choose(list());
  const output = gitPath(
    'recovery40/' +
      new Date().toISOString().replace(/[:.]/g, '-') +
      '-' +
      randomUUID().slice(0, 8)
  );
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const report = {
      format: 'clutter-read-failure40',
      candidate,
      runId: id,
      status: 'diagnosing',
      trace:
        'not-run; prior trace preserved, export failed with Document Missing Template Error',
      ranking: 'not-qualified',
    },
    reportFile = join(output, 'diagnostic-report.json');
  try {
    execFileSync(
      '/usr/bin/codesign',
      ['--verify', '--deep', '--strict', record.app],
      { timeout: 15000, stdio: 'pipe' }
    );
    const binary = join(output, 'counter'),
      counter = join(source, '../instruments39/counter.c');
    report.sourceSha256 = sha(readFileSync(counter));
    const compile = spawnSync(
      '/usr/bin/xcrun',
      [
        '--sdk',
        'macosx',
        'clang',
        '-std=c11',
        '-O2',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-arch',
        'arm64',
        '-mmacosx-version-min=14.0',
        counter,
        '-o',
        binary,
      ],
      { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 }
    );
    writeJson(join(output, 'compile.json'), {
      status: compile.status,
      errorCode: compile.error?.code ?? null,
      stdout: compile.stdout ?? '',
      stderr: compile.stderr ?? '',
    });
    if (compile.status !== 0 || compile.error)
      throw Error('DIAGNOSTIC_COMPILE_FAILED');
    report.probeSha256 = sha(readFileSync(binary));
    const before = list(),
      selected = choose(before),
      raw = spawnSync(
        binary,
        ['--pids', ...selected.map((p) => String(p.pid))],
        { encoding: 'utf8', timeout: 10000, maxBuffer: 2 * 1024 * 1024 }
      );
    if (raw.status !== 0 || raw.error) throw Error('COUNTER_READ_FAILED');
    const after = list(),
      sample = sanitizeSample(selected, JSON.parse(raw.stdout), after);
    const afterSelected = choose(after);
    sample.membershipStableDuringRead =
      JSON.stringify(selected.map((x) => x.pid).sort((a, b) => a - b)) ===
      JSON.stringify(afterSelected.map((x) => x.pid).sort((a, b) => a - b));
    if (!sample.membershipStableDuringRead) {
      sample.knownProcessSumBytes = null;
      sample.includingAllObservedSameUserWebKitBytes = null;
    }
    report.sample = sample;
    report.failureCounts = {};
    for (const p of sample.processes)
      if (p.status !== 'read') {
        const key = p.failureStage + ':errno-' + (p.errorNumber ?? 'none');
        report.failureCounts[key] = (report.failureCounts[key] ?? 0) + 1;
      }
    report.status = 'failure-diagnostic-complete';
    report.next =
      'Use exact stage/errno to decide correction or OS restriction; no blanket permission escalation, path-guard bypass, RSS substitution or host ranking';
  } catch (e) {
    report.status = 'failure-diagnostic-blocked';
    report.error = e.message;
    process.exitCode = 2;
  }
  writeJson(reportFile, report);
  console.log(JSON.stringify({ ...report, report: reportFile }, null, 2));
}
