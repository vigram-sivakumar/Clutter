import { traceProcess } from '../recovery40/trace-process.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { sha, writeJson } from '../build34/projects.mjs';
import { completedCandidate } from '../build34/launch-model.mjs';
import { assessCalibration } from '../instruments38/model.mjs';
import {
  captureArgs,
  parseProcessList,
  selectProcesses,
  sanitizeSample,
  schemaNames,
} from './model.mjs';
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
    JSON.stringify({
      status: 'MAC_ARM64_REQUIRED',
      memory: 'not-run',
      presentation: 'not-run',
    })
  );
  process.exitCode = 2;
} else await capture();
async function capture() {
  const gitPath = (p) =>
    resolve(
      root,
      execFileSync(
        'git',
        ['rev-parse', '--git-path', 'clutter-host-qualification/' + p],
        { cwd: root, encoding: 'utf8' }
      ).trim()
    );
  const id = args['--run'],
    candidate = args['--candidate'],
    pins = sha(readFileSync(join(source, '../preflight-manifest.json'))),
    { record } = completedCandidate(gitPath('builds'), id, candidate, pins);
  const previous = JSON.parse(
    readFileSync(
      gitPath('gui/' + id + '/' + candidate + '/latest.json'),
      'utf8'
    )
  );
  if (
    previous.runId !== id ||
    previous.candidate !== candidate ||
    previous.bundle !== record.app ||
    previous.resources !== record.resources ||
    !Number.isSafeInteger(previous.uiPid)
  )
    throw Error('GUI_BINDING_MISMATCH');
  const inventory = () =>
    parseProcessList(
      execFileSync('/bin/ps', ['-ww', '-axo', 'pid=,ppid=,uid=,comm='], {
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
        timeout: 10000,
      })
    );
  const selection = (rows) =>
    selectProcesses(rows, {
      app: record.app,
      resources: record.resources,
      uiPid: previous.uiPid,
      uid: process.getuid(),
    });
  selection(inventory()); // Refuse missing UI before creating outputs; never launch/recover implicitly.
  const launchId =
      new Date().toISOString().replace(/[:.]/g, '-') +
      '-' +
      randomUUID().slice(0, 8),
    output = gitPath('instruments39/' + launchId);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const reportFile = join(output, 'capture-report.json'),
    report = {
      format: 'clutter-process-capture39',
      candidate,
      runId: id,
      bundleSha256: record.bundleSha256,
      profile: 'unchanged single-page GUI37 fixture; not HP10/HP1K/HP10K',
      status: 'capturing',
      samples: [],
      memoryRanking: 'not-qualified',
      presentation: 'not-run',
    };
  const checkpoint = () => writeJson(reportFile, report);
  const run = (label, exe, argv, timeout = 30000) => {
    console.error('[' + label + ']');
    const p = spawnSync(exe, argv, {
      cwd: output,
      encoding: 'utf8',
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        PATH: '/usr/bin:/bin',
        NODE_OPTIONS: '',
        NODE_PATH: '',
      },
    });
    writeJson(join(output, label + '.json'), {
      status: p.status,
      signal: p.signal,
      errorCode: p.error?.code ?? null,
      stdout: p.stdout ?? '',
      stderr: p.stderr ?? '',
    });
    return p;
  };
  checkpoint();
  try {
    const verify = run('verify-app', '/usr/bin/codesign', [
      '--verify',
      '--deep',
      '--strict',
      record.app,
    ]);
    if (verify.status !== 0) throw Error('SIGNATURE_VERIFICATION_FAILED');
    const binary = join(output, 'counter'),
      flags = [
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
        join(source, 'counter.c'),
        '-o',
        binary,
      ];
    report.probeSourceSha256 = sha(readFileSync(join(source, 'counter.c')));
    report.baseProbeSourceSha256 = sha(
      readFileSync(join(source, '../instruments38/physical-footprint.c'))
    );
    const compiler = run('clang-version', '/usr/bin/xcrun', [
      '--sdk',
      'macosx',
      'clang',
      '--version',
    ]);
    const sdk = run('sdk-version', '/usr/bin/xcrun', [
      '--sdk',
      'macosx',
      '--show-sdk-version',
    ]);
    if (compiler.status !== 0 || sdk.status !== 0)
      throw Error('PROBE_TOOLCHAIN_UNAVAILABLE');
    report.compiler = compiler.stdout.trim();
    report.sdk = sdk.stdout.trim();
    report.compileArguments = flags.slice(0, -3);
    const compile = run('compile-counter', '/usr/bin/xcrun', flags);
    if (compile.status !== 0) throw Error('COUNTER_COMPILE_FAILED');
    report.probeSha256 = sha(readFileSync(binary));
    const sanity = run('counter-sanity', binary, ['--self-test'], 20000);
    let decoded;
    try {
      decoded = JSON.parse(sanity.stdout);
    } catch {}
    report.counterSanity = assessCalibration(decoded, sanity.status);
    if (report.counterSanity !== 'counter-sanity-pass')
      throw Error('COUNTER_SANITY_INCONCLUSIVE');
    for (let index = 0; index < 3; index++) {
      console.error('[process-snapshot-' + (index + 1) + ']');
      const before = inventory(),
        selected = selection(before);
      // Raw paths stay in memory only. Persist only sanitized candidate roles, PIDs and counters.
      const p = spawnSync(
        binary,
        ['--pids', ...selected.map((x) => String(x.pid))],
        { encoding: 'utf8', timeout: 10000, maxBuffer: 2 * 1024 * 1024 }
      );
      if (p.error || p.status !== 0) throw Error('PROCESS_COUNTER_FAILED');
      const after = inventory(),
        afterSelected = selection(after),
        sample = sanitizeSample(selected, JSON.parse(p.stdout), after);
      sample.membershipStableDuringRead =
        JSON.stringify(selected.map((x) => x.pid).sort((a, b) => a - b)) ===
        JSON.stringify(afterSelected.map((x) => x.pid).sort((a, b) => a - b));
      if (!sample.membershipStableDuringRead) {
        sample.knownProcessSumBytes = null;
        sample.includingAllObservedSameUserWebKitBytes = null;
      }
      report.samples.push({ sample: index + 1, ...sample });
      checkpoint();
      if (index < 2) await new Promise((ok) => setTimeout(ok, 750));
    }
    report.processSetStable = report.samples.every(
      (s) =>
        JSON.stringify(
          s.processes
            .map((p) => [p.pid, p.startTicks ?? null])
            .sort((a, b) => a[0] - b[0])
        ) ===
        JSON.stringify(
          report.samples[0].processes
            .map((p) => [p.pid, p.startTicks ?? null])
            .sort((a, b) => a[0] - b[0])
        )
    );
    // Trace acquisition is AFTER counter snapshots, so Instruments overhead does not enter them.
    const help = run('xctrace-record-help', '/usr/bin/xcrun', [
      'xctrace',
      'help',
      'record',
    ]);
    if (
      help.status === 0 &&
      ['--no-prompt', '--attach', '--time-limit'].every((flag) =>
        (help.stdout + help.stderr).includes(flag)
      )
    ) {
      const trace = join(output, 'presentation.trace'),
        p = await traceProcess(
          '/usr/bin/xcrun',
          [
            'xctrace',
            'record',
            '--template',
            'Animation Hitches',
            '--attach',
            String(previous.uiPid),
            '--time-limit',
            '5s',
            '--no-prompt',
            '--output',
            trace,
          ],
          {
            cwd: output,
            env: {
              ...process.env,
              PATH: '/usr/bin:/bin',
              NODE_OPTIONS: '',
              NODE_PATH: '',
            },
          }
        );
      writeJson(join(output, 'native-trace.json'), p);
      report.traceSignalsSent = p.signalsSent;
      report.traceRecordExit = p.status;
      report.traceArtifactPresent = existsSync(trace);
      if (report.traceArtifactPresent) {
        const toc = join(output, 'trace-toc.xml'),
          exported = run(
            'trace-toc',
            '/usr/bin/xcrun',
            ['xctrace', 'export', '--input', trace, '--toc', '--output', toc],
            15000
          );
        if (exported.status === 0 && existsSync(toc)) {
          report.traceSchemas = schemaNames(readFileSync(toc, 'utf8'));
          report.presentation =
            'trace-acquired; event-to-present correlation not validated';
        } else report.presentation = 'blocked: trace export unavailable';
      } else
        report.presentation =
          'blocked: trace attach failed or timed out; see private logs';
    } else
      report.presentation = 'blocked: installed record interface unavailable';
    report.status =
      report.samples.some(
        (s) => s.unavailableProcesses || !s.membershipStableDuringRead
      ) || report.presentation.startsWith('blocked:')
        ? 'diagnostic-capture-with-blockers'
        : 'diagnostic-capture-complete';
    report.remaining = [
      'Prove process membership/coalition attribution and shared-page accounting before aggregate memory ranking',
      'Map trace tables to actual input and physical presentation; empty idle trace or table presence is not latency evidence',
      'Bind font/display/power and representative frozen H01 workload before benchmark samples',
    ];
    checkpoint();
    console.log(JSON.stringify({ ...report, report: reportFile }, null, 2));
  } catch (e) {
    report.status = 'diagnostic-capture-blocked';
    report.error = e.message;
    checkpoint();
    console.log(
      JSON.stringify(
        { status: report.status, error: report.error, report: reportFile },
        null,
        2
      )
    );
    process.exitCode = 2;
  }
}
