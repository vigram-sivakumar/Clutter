import { isDeepStrictEqual } from 'node:util';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
const env = { ...process.env, PATH: '/usr/bin:/bin' };
export async function runCli(resources, session, command, args = []) {
  const p = spawn(
    join(resources, 'runtime/node'),
    [join(resources, 'launcher.mjs'), '--session', session, ...args],
    { env, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  let out = '',
    err = '';
  p.stdout.on('data', (b) => (out += b));
  p.stderr.on('data', (b) => (err += b));
  let timer = setTimeout(() => p.kill('SIGKILL'), 25000);
  p.stdin.end(JSON.stringify(command));
  const [exit] = await once(p, 'exit');
  clearTimeout(timer);
  if (exit !== 0) throw Error('PACKAGED_CLI_FAILED ' + out + ' ' + err);
  return JSON.parse(out);
}
export async function headlessSmoke(resources, session) {
  const report = {
    scope:
      'Packaged owner/CLI/MCP without a native window or global developer Node; not a native input or distribution result.',
    checks: [],
  };
  const [a, b] = await Promise.all([
    runCli(resources, session, { method: 'read' }),
    runCli(resources, session, { method: 'read' }),
  ]);
  if (
    a.result.ownerEpoch !== b.result.ownerEpoch ||
    a.result.spaceId !== b.result.spaceId
  )
    throw Error('BOOTSTRAP_OWNER_SPLIT');
  report.checks.push({
    id: 'HN-01',
    status: 'pass',
    title: 'Concurrent app-closed clients attach to one owner',
  });
  const c = {
      method: 'insert',
      operationId: randomUUID(),
      expectedVersion: a.result.version,
      target: 'Alpha',
      offset: 0,
      text: 'HEADLESS ',
    },
    applied = await runCli(resources, session, c);
  if (applied.result.status !== 'applied')
    throw Error('HEADLESS_INSERT_FAILED');
  const p = spawn(
    join(resources, 'runtime/node'),
    [join(resources, 'launcher.mjs'), '--session', session, '--mcp'],
    { env, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  p.stderr.resume();
  let id = 0;
  const pending = new Map();
  createInterface({ input: p.stdout }).on('line', (line) => {
    const r = JSON.parse(line);
    pending.get(r.id)?.(r);
    pending.delete(r.id);
  });
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const key = ++id,
        t = setTimeout(() => {
          p.kill('SIGKILL');
          reject(Error('MCP_TIMEOUT'));
        }, 25000);
      pending.set(key, (r) => {
        clearTimeout(t);
        resolve(r);
      });
      p.stdin.write(
        JSON.stringify({ jsonrpc: '2.0', id: key, method, params }) + '\n'
      );
    });
  await send('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'joined-native-smoke', version: '1' },
  });
  p.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) +
      '\n'
  );
  const retry = await send('tools/call', {
    name: 'lab_command',
    arguments: {
      spaceId: a.result.spaceId,
      documentId: a.result.documentId,
      ...c,
    },
  });
  if (
    retry.result?.isError ||
    !isDeepStrictEqual(
      JSON.parse(retry.result?.content?.[0]?.text ?? 'null'),
      applied.result
    )
  )
    throw Error('MCP_ORIGINAL_RECEIPT_MISMATCH');
  const exited = once(p, 'exit');
  p.stdin.end();
  await exited;
  const last = await runCli(resources, session, { method: 'read' });
  if (last.result.version !== a.result.version + 1)
    throw Error('HEADLESS_DUPLICATE_EFFECT');
  report.checks.push({
    id: 'HN-02',
    status: 'pass',
    title: 'CLI/MCP original receipt and one durable effect',
    operationId: c.operationId,
    version: last.result.version,
  });
  report.owner = {
    spaceId: last.result.spaceId,
    documentId: last.result.documentId,
    ownerEpoch: last.result.ownerEpoch,
  };
  report.driverNode = process.version;
  report.stateFromCommittedOwner = true;
  return report;
}
