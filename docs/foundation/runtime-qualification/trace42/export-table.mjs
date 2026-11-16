// Shared bounded OS export/XML-analysis port for existing trace inspection.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sha, writeJson } from '../build34/projects.mjs';
const source = dirname(fileURLToPath(import.meta.url));
export function exportTable({ schema, schemas, trace, output, uiPid }) {
  if (!schemas.includes(schema)) {
    return { schema, status: 'schema-unavailable' };
  }
  console.error('[export-' + schema + ']');
  const result = spawnSync(
    '/usr/bin/xcrun',
    [
      'xctrace',
      'export',
      '--input',
      trace,
      '--xpath',
      '/trace-toc/run[@number="1"]/data/table[@schema="' + schema + '"]',
    ],
    {
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PATH: '/usr/bin:/bin' },
    }
  );
  const entry = {
    schema,
    exitCode: result.status,
    errorCode: result.error?.code ?? null,
    signal: result.signal ?? null,
  };
  // XML and OS export errors remain private. Never echo process names, paths or arbitrary trace text.
  writeJson(join(output, schema + '-export-status.json'), {
    ...entry,
    stderr: result.stderr ?? '',
  });
  if (
    result.error ||
    result.status !== 0 ||
    Buffer.byteLength(result.stdout ?? '') > 4 * 1024 * 1024
  ) {
    entry.status = 'export-blocked';
    return entry;
  }
  const path = join(output, schema + '.xml');
  writeFileSync(path, result.stdout, { mode: 0o600, flag: 'wx' });
  entry.xmlSha256 = sha(result.stdout);
  const parsed = spawnSync(
    '/usr/bin/python3',
    [join(source, 'analyze.py'), path, String(uiPid)],
    { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 }
  );
  if (parsed.error || parsed.status !== 0) {
    entry.status = 'analysis-blocked';
    entry.analysisExit = parsed.status;
    entry.analysisErrorCode = parsed.error?.code ?? null;
  } else {
    try {
      entry.summary = JSON.parse(parsed.stdout);
      entry.status = 'structure-exported';
    } catch {
      entry.status = 'analysis-blocked';
    }
  }
  return entry;
}
