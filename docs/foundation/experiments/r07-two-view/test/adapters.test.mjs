import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
const request = {
  method: 'insert',
  version: 0,
  id: 'adapter-op',
  target: 'Alpha',
  text: 'CLI-',
};
function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'clutter-r07-adapter-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const run = (script, dir, input) =>
  spawnSync(process.execPath, [script, '--store', dir], {
    input,
    encoding: 'utf8',
    timeout: 10000,
  });
const message = (id, method, params) =>
  JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
const init = message(1, 'initialize', {
  protocolVersion: '2025-11-25',
  clientInfo: { name: 'test', version: '1' },
  capabilities: {},
});

test('CLI returns one JSON result, durable save and deduplicated outcome on restart', (t) => {
  const dir = temp(t);
  const a = run('cli.mjs', dir, JSON.stringify(request));
  assert.equal(a.status, 0, a.stderr);
  const first = JSON.parse(a.stdout);
  assert.equal(first.result.durable, true);
  const again = run('cli.mjs', dir, JSON.stringify(request));
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(JSON.parse(again.stdout), first);
});
test('CLI stale mutation fails without modifying prior durable state', (t) => {
  const dir = temp(t);
  run('cli.mjs', dir, JSON.stringify(request));
  const stale = run(
    'cli.mjs',
    dir,
    JSON.stringify({ ...request, id: 'stale' })
  );
  assert.equal(stale.status, 1);
  assert.equal(JSON.parse(stale.stdout).error, 'STALE_VERSION');
  const read = JSON.parse(run('cli.mjs', dir, '{"method":"read"}').stdout);
  assert.equal(read.result.version, 1);
});
test('MCP tool and CLI use the same authority state and receipt semantics', (t) => {
  const dir = temp(t);
  run('cli.mjs', dir, JSON.stringify(request));
  const output = run(
    'mcp.mjs',
    dir,
    init +
      message(2, 'tools/list', {}) +
      message(3, 'tools/call', { name: 'lab_command', arguments: request })
  );
  assert.equal(output.status, 0, output.stderr);
  const lines = output.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, 3);
  assert.equal(lines[1].result.tools[0].name, 'lab_command');
  assert.equal(JSON.parse(lines[2].result.content[0].text).version, 1);
});
test('MCP mutation can be read through CLI after the adapter exits', (t) => {
  const dir = temp(t);
  const out = run(
    'mcp.mjs',
    dir,
    init + message(2, 'tools/call', { name: 'lab_command', arguments: request })
  );
  assert.equal(out.status, 0, out.stderr);
  const read = JSON.parse(
    run('cli.mjs', dir, '{"method":"read"}').stdout
  ).result;
  assert.equal(read.version, 1);
  assert.equal(read.doc.content[0].content[0].text, 'CLI-Alpha beta');
});
test('MCP malformed input is framed as JSON-RPC errors and has no side effects', (t) => {
  const dir = temp(t);
  const out = run('mcp.mjs', dir, 'garbage\n' + message(1, 'tools/list', {}));
  const lines = out.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(lines[0].error.code, -32700);
  assert.equal(lines[1].error.message, 'Initialize first');
  assert.equal(
    JSON.parse(run('cli.mjs', dir, '{"method":"read"}').stdout).result.version,
    0
  );
});
test('MCP rejects unpinned protocol and reports changed-payload retry as tool error', (t) => {
  const dir = temp(t);
  const input =
    message(0, 'initialize', { protocolVersion: 'unsupported' }) +
    init +
    message(2, 'tools/call', { name: 'lab_command', arguments: request }) +
    message(3, 'tools/call', {
      name: 'lab_command',
      arguments: { ...request, text: 'different' },
    });
  const lines = run('mcp.mjs', dir, input)
    .stdout.trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(lines[0].error.code, -32602);
  assert.equal(lines[3].result.isError, true);
  assert.match(lines[3].result.content[0].text, /OPERATION_ID_REUSED/);
});

async function running(t, dir, mutate = false) {
  const child = spawn(process.execPath, ['mcp.mjs', '--store', dir], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
  });
  child.stdin.write(
    init +
      (mutate
        ? message(2, 'tools/call', { name: 'lab_command', arguments: request })
        : '')
  );
  const lines = createInterface({ input: child.stdout });
  let count = 0;
  for await (const line of lines) {
    JSON.parse(line);
    if (++count === (mutate ? 2 : 1)) break;
  }
  return child;
}
test(
  'separate CLI process refuses a store already owned by a live MCP host',
  { timeout: 10000 },
  async (t) => {
    const dir = temp(t),
      child = await running(t, dir);
    const denied = run('cli.mjs', dir, '{"method":"read"}');
    assert.equal(denied.status, 1);
    assert.match(JSON.parse(denied.stdout).error, /EEXIST/);
    const exited = once(child, 'exit');
    child.stdin.end();
    await exited;
    assert.equal(run('cli.mjs', dir, '{"method":"read"}').status, 0);
  }
);
test(
  'process kill retains acknowledged snapshot and stale ownership fails closed',
  { timeout: 10000 },
  async (t) => {
    const dir = temp(t),
      child = await running(t, dir, true);
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
    const saved = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
    assert.equal(saved.doc.content[0].content[0].text, 'CLI-Alpha beta');
    const denied = run('cli.mjs', dir, '{"method":"read"}');
    assert.equal(denied.status, 1);
    assert.match(JSON.parse(denied.stdout).error, /EEXIST/);
    // Deliberately no unsafe automatic stale-lock deletion. Process kill is not power-loss proof.
  }
);
