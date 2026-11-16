// No GUI/service/Space is launched or modified. Only the calibration child allocates memory.
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { sha, writeJson } from '../build34/projects.mjs';
import { loadBuild, keptArchive } from '../build34/retry.mjs';
import { completedCandidate } from '../build34/launch-model.mjs';
import {
  installedBytes,
  prepareArgs,
  assessCalibration,
  trialSizeDisposition,
} from './model.mjs';
const source = dirname(fileURLToPath(import.meta.url)),
  root = resolve(source, '../../../..');
const runId = prepareArgs(process.argv.slice(2));
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
    );
  const builds = gitPath('builds'),
    pins = sha(readFileSync(join(source, '../preflight-manifest.json')));
  const completed = loadBuild(builds, runId, pins, 'build-smoke-complete');
  const id =
      new Date().toISOString().replace(/[:.]/g, '-') +
      '-' +
      randomUUID().slice(0, 8),
    output = gitPath('instruments38/' + id);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const report = {
    format: 'clutter-instruments38',
    runId,
    createdAt: new Date().toISOString(),
    status: 'preparing',
    profile: 'existing ad-hoc signed build artifacts; no H01 workload samples',
    sizes: {},
    memory: 'not-run',
    presentation: 'not-run',
    ranking: 'not-qualified',
  };
  const reportFile = join(output, 'instrument-report.json'),
    checkpoint = () => writeJson(reportFile, report);
  const command = (label, exe, args, timeout = 30000) => {
    console.error('[' + label + ']');
    const result = spawnSync(exe, args, {
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
      status: result.status,
      signal: result.signal,
      errorCode: result.error?.code ?? null,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    });
    if (result.error || result.status !== 0)
      throw Error(label.toUpperCase() + '_FAILED_SEE_PRIVATE_LOG');
    return result.stdout.trim();
  };
  checkpoint();
  try {
    const contract = JSON.parse(
      readFileSync(join(source, '../contract.json'), 'utf8')
    );
    report.contractSha256 = sha(readFileSync(join(source, '../contract.json')));
    const limit = (key) =>
      contract.hostThresholds.find((x) => x.id === key).maxMiB;
    for (const candidate of ['H-S', 'H-E', 'H-T']) {
      console.error('[verify-and-size-' + candidate + ']');
      const { record } = completedCandidate(builds, runId, candidate, pins);
      command('verify-' + candidate, '/usr/bin/codesign', [
        '--verify',
        '--deep',
        '--strict',
        record.app,
      ]);
      const archive = keptArchive(builds, completed, candidate),
        bytes = readFileSync(archive.path);
      if (sha(bytes) !== record.archiveSha256)
        throw Error('ARCHIVE_HASH_MISMATCH_' + candidate);
      const installed = installedBytes(record.app);
      report.sizes[candidate] = {
        bundleSha256: record.bundleSha256,
        archiveSha256: record.archiveSha256,
        archiveOriginRun: archive.runId,
        archiveBytes: bytes.length,
        installed,
        compressedLimitMiB: limit('BH-03'),
        installedLimitMiB: limit('BH-04'),
        compressedTrial: trialSizeDisposition(bytes.length, limit('BH-03')),
        installedLogicalTrial: trialSizeDisposition(
          installed.logicalBytes,
          limit('BH-04')
        ),
        releaseQualification:
          'not-run; ad-hoc experimental ZIP, no notarized shipping artifact or OS webview dependency bytes included',
      };
      checkpoint();
    }
    report.instrumentSourceSha256 = sha(
      readFileSync(join(source, 'physical-footprint.c'))
    );
    report.compiler = command('clang-version', '/usr/bin/xcrun', [
      '--sdk',
      'macosx',
      'clang',
      '--version',
    ]);
    report.sdk = command('sdk-version', '/usr/bin/xcrun', [
      '--sdk',
      'macosx',
      '--show-sdk-version',
    ]);
    const binary = join(output, 'physical-footprint');
    report.compileFlags = [
      '-std=c11',
      '-O2',
      '-Wall',
      '-Wextra',
      '-Werror',
      '-arch',
      'arm64',
      '-mmacosx-version-min=14.0',
    ];
    command('compile-counter', '/usr/bin/xcrun', [
      '--sdk',
      'macosx',
      'clang',
      ...report.compileFlags,
      join(source, 'physical-footprint.c'),
      '-o',
      binary,
    ]);
    report.instrumentSha256 = sha(readFileSync(binary));
    const calibration = spawnSync(binary, ['--self-test'], {
      cwd: output,
      encoding: 'utf8',
      timeout: 20000,
      maxBuffer: 65536,
    });
    writeJson(join(output, 'counter-calibration.json'), {
      status: calibration.status,
      signal: calibration.signal,
      errorCode: calibration.error?.code ?? null,
      stdout: calibration.stdout ?? '',
      stderr: calibration.stderr ?? '',
    });
    let decoded;
    try {
      decoded = JSON.parse(calibration.stdout);
    } catch {
      decoded = null;
    }
    report.calibration = decoded;
    report.memory = assessCalibration(
      decoded,
      calibration.error ? null : calibration.status
    );
    report.status =
      report.memory === 'counter-sanity-pass'
        ? 'package-accounting-and-counter-sanity-complete'
        : 'counter-calibration-inconclusive';
    report.remaining = [
      'Candidate/helper/WebKit shared-process membership and aggregation validation',
      'Controlled fixture/host/font/display/power binding before timed runs',
      'Actual native presentation/input instrumentation calibration, not JS or RAF proxy',
      'Applicable H01 workload samples, lifecycle/security cases and final comparison',
    ];
    checkpoint();
    console.log(JSON.stringify({ ...report, report: reportFile }, null, 2));
    if (report.memory !== 'counter-sanity-pass') process.exitCode = 2;
  } catch (e) {
    report.status = 'instrument-preparation-blocked';
    report.error = e.message;
    checkpoint();
    console.log(
      JSON.stringify(
        {
          status: report.status,
          error: report.error,
          report: reportFile,
          presentation: 'not-run',
          ranking: 'not-qualified',
        },
        null,
        2
      )
    );
    process.exitCode = 2;
  }
}
