import { exportTable } from './export-table.mjs';
// Derive small exports from the existing trace only; never record or launch an app.
import {
  readFileSync,
  mkdirSync,
  lstatSync,
  realpathSync,
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { sha, writeJson } from '../build34/projects.mjs';
import { schemaNames } from '../instruments39/model.mjs';
const source = dirname(fileURLToPath(import.meta.url)),
  root = resolve(source, '../../../..'),
  args = process.argv.slice(2);
if (
  args.length !== 2 ||
  args[0] !== '--capture' ||
  !/^[A-Za-z0-9-]{1,100}$/.test(args[1])
)
  throw Error('USE_--capture_EXISTING_CAPTURE_ID');
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
} else exportExisting();
function exportExisting() {
  const gitPath = (p) =>
    resolve(
      root,
      execFileSync(
        'git',
        ['rev-parse', '--git-path', 'clutter-host-qualification/' + p],
        { cwd: root, encoding: 'utf8' }
      ).trim()
    );
  const input = gitPath('instruments39/' + args[1]);
  if (realpathSync(input) !== input) throw Error('INVALID_CAPTURE_PATH');
  const parentBytes = readFileSync(join(input, 'capture-report.json')),
    parent = JSON.parse(parentBytes),
    tocPath = join(input, 'trace-toc.xml'),
    trace = join(input, 'presentation.trace');
  if (
    parent.format !== 'clutter-process-capture39' ||
    !['H-T', 'H-E'].includes(parent.candidate) ||
    !parent.traceArtifactPresent ||
    !/^[a-f0-9]{64}$/.test(parent.bundleSha256) ||
    lstatSync(tocPath).size > 8 * 1024 * 1024 ||
    realpathSync(trace) !== trace
  )
    throw Error('INVALID_CAPTURE_BINDING');
  const toc = readFileSync(tocPath, 'utf8'),
    schemas = schemaNames(toc),
    ui = parent.samples?.[0]?.processes?.find(
      (p) => p.role === 'ui' && p.status === 'read'
    );
  if (!ui) throw Error('MISSING_CAPTURE_UI_IDENTITY');
  const output = gitPath(
    'trace42/' +
      new Date().toISOString().replace(/[:.]/g, '-') +
      '-' +
      randomUUID().slice(0, 8)
  );
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const report = {
      format: 'clutter-existing-trace42',
      sourceCapture: args[1],
      sourceReportSha256: sha(parentBytes),
      sourceTocSha256: sha(toc),
      candidate: parent.candidate,
      bundleSha256: parent.bundleSha256,
      recording: 'not-run',
      status: 'exporting',
      schemas,
      tables: [],
      ranking: 'not-qualified',
    },
    reportFile = join(output, 'trace-analysis-report.json');
  const checkpoint = () => writeJson(reportFile, report);
  checkpoint();
  for (const schema of [
    'process-info',
    'hitches-frame-lifetimes',
    'displayed-surfaces-interval',
  ]) {
    report.tables.push(
      exportTable({ schema, schemas, trace, output, uiPid: ui.pid })
    );
    checkpoint();
  }
  report.status = report.tables.every((t) => t.status === 'structure-exported')
    ? 'bounded-structure-export-complete'
    : 'bounded-export-with-blockers';
  report.remaining = [
    'Validate actual table definitions/units and reference/PID relationships',
    'Correlate real input to actual presentation in a controlled trace before claiming latency',
    'Prove candidate/shared WebKit membership and shared-page accounting before footprint ranking',
    'Bind HP workloads/font/display/power and compare eligible candidates',
  ];
  checkpoint();
  console.log(JSON.stringify({ ...report, report: reportFile }, null, 2));
}
