// One operator-controlled keyboard trial; no synthetic events, content hooks or Core policy.
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
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
  schemaNames,
} from '../instruments39/model.mjs';
import { traceProcess } from '../recovery40/trace-process.mjs';
import { startAnnouncement, controlledResult } from './model.mjs';
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
} else await trial();
async function trial() {
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
  const contractBytes = readFileSync(join(source, 'contract.json')),
    contract = JSON.parse(contractBytes),
    { record } = completedCandidate(
      gitPath('builds'),
      runId,
      candidate,
      sha(readFileSync(join(source, '../preflight-manifest.json')))
    );
  const locator = JSON.parse(
    readFileSync(
      gitPath('gui/' + runId + '/' + candidate + '/latest.json'),
      'utf8'
    )
  );
  if (
    locator.runId !== runId ||
    locator.candidate !== candidate ||
    locator.bundle !== record.app ||
    locator.resources !== record.resources ||
    !Number.isSafeInteger(locator.uiPid)
  )
    throw Error('GUI_BINDING_MISMATCH');
  const selected = selectProcesses(
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
  execFileSync(
    '/usr/bin/codesign',
    ['--verify', '--deep', '--strict', record.app],
    { timeout: 15000, stdio: 'pipe' }
  );
  const id =
      new Date().toISOString().replace(/[:.]/g, '-') +
      '-' +
      randomUUID().slice(0, 8),
    output = gitPath('controlled43/' + id);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const report = {
      format: 'clutter-controlled-input43',
      id,
      runId,
      candidate,
      bundleSha256: record.bundleSha256,
      contractSha256: sha(contractBytes),
      targetUiPid: locator.uiPid,
      observedProcessRoles: selected.map((p) => ({ pid: p.pid, role: p.role })),
      status: 'starting-method-trial',
      operatorInput: 'not-confirmed by native trace yet',
      inputLatency: 'not-qualified',
      memory: 'not-measured',
      ranking: 'not-qualified',
    },
    file = join(output, 'trial-report.json'),
    checkpoint = () => writeJson(file, report);
  checkpoint();
  const announce = startAnnouncement();
  console.log(
    'Wait for RECORDING STARTED. Then click in View A text and type a, b, c about two seconds apart. Leave the app open.'
  );
  const trace = join(output, 'input.trace');
  const result = await traceProcess(
    '/usr/bin/xcrun',
    [
      'xctrace',
      'record',
      '--template',
      'Animation Hitches',
      '--attach',
      String(locator.uiPid),
      '--time-limit',
      String(contract.nativeCaptureSeconds) + 's',
      '--no-prompt',
      '--output',
      trace,
    ],
    {
      cwd: output,
      env: { ...process.env, PATH: '/usr/bin:/bin' },
      interruptMs: 32000,
      terminateMs: 47000,
      killMs: 50000,
      onStdout: (chunk) => {
        if (announce(chunk)) {
          report.startAnnouncementObserved = true;
          console.log(
            'RECORDING STARTED: click View A, place the caret, type a ... b ... c.'
          );
        }
      },
    }
  );
  writeJson(join(output, 'recording-process.json'), result);
  report.recordExit = result.status;
  report.recordErrorCode = result.errorCode;
  report.signalsSent = result.signalsSent;
  report.tracePresent = existsSync(trace);
  checkpoint();
  if (report.tracePresent) {
    console.error('[export-controlled-trace-toc]');
    const toc = join(output, 'trace-toc.xml'),
      p = spawnSync(
        '/usr/bin/xcrun',
        ['xctrace', 'export', '--input', trace, '--toc', '--output', toc],
        {
          cwd: output,
          encoding: 'utf8',
          timeout: 15000,
          maxBuffer: 2 * 1024 * 1024,
        }
      );
    writeJson(join(output, 'toc-export-status.json'), {
      status: p.status,
      errorCode: p.error?.code ?? null,
      stdout: p.stdout ?? '',
      stderr: p.stderr ?? '',
    });
    report.tocExit = p.error ? null : p.status;
    if (p.status === 0 && !p.error && existsSync(toc))
      report.schemas = schemaNames(readFileSync(toc, 'utf8'));
  }
  report.status = controlledResult({
    status: result.status,
    errorCode: result.errorCode,
    tracePresent: report.tracePresent,
    tocExit: report.tocExit,
  });
  report.next =
    'Inspect actual controlled input/producer/presentation linkage once. If absent, record exact H11 blocker; no latency percentile or host choice from capture alone.';
  checkpoint();
  console.log(JSON.stringify({ ...report, report: file }, null, 2));
  if (report.status === 'method-trial-capture-blocked') process.exitCode = 2;
}
