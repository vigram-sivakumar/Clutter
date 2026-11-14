import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { server } from '../serve.mjs';
import { liveRelay } from '../src/live-relay.mjs';
const strict = process.argv.includes('--strict');
const contract = JSON.parse(
  readFileSync('matched-comparison-contract.json', 'utf8')
);
const results = [],
  processErrors = [];
const app = await server(0);
let browser, relay, mcp;
const jsonFile = (name, value) => {
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/' + name, JSON.stringify(value, null, 2) + '\n');
};
function subprocess(file, env, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('SUBPROCESS_TIMEOUT'));
    }, 15000);
    child.on('error', reject);
    child.stdout.on('data', (s) => (stdout += s));
    child.stderr.on('data', (s) => (stderr += s));
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(input);
  });
}
function mcpClient(env) {
  const child = spawn(process.execPath, ['live-mcp.mjs'], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map();
  let sequence = 0;
  child.stderr.on('data', (s) => processErrors.push(s.toString()));
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    const r = JSON.parse(line),
      p = pending.get(r.id);
    if (p) {
      pending.delete(r.id);
      clearTimeout(p.timer);
      p.resolve(r);
    }
  });
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++sequence,
        timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('MCP_TIMEOUT'));
        }, 10000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          ...(params ? { params } : {}),
        }) + '\n'
      );
    });
  return {
    request,
    notify: (method, params) =>
      child.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          method,
          ...(params ? { params } : {}),
        }) + '\n'
      ),
    close: () =>
      new Promise((resolve) => {
        child.on('close', resolve);
        child.stdin.end();
        setTimeout(() => child.kill(), 2000).unref();
      }),
  };
}
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
    args:
      process.platform === 'linux'
        ? ['--no-sandbox', '--no-zygote', '--single-process']
        : [],
  });
  const page = await browser.newPage();
  let globalName;
  relay = await liveRelay(async (command) => {
    try {
      return await page.evaluate(
        ({ g, command }) => {
          try {
            return { ok: true, result: window[g].liveCommand(command) };
          } catch (e) {
            return { ok: false, error: e.code ?? e.message };
          }
        },
        { g: globalName, command }
      );
    } catch {
      return { ok: false, error: 'OWNER_UNAVAILABLE' };
    }
  });
  mcp = mcpClient(relay.env);
  const beforeInit = await mcp.request('tools/list');
  assert.equal(beforeInit.error.code, -32000);
  const init = await mcp.request('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'qualification', version: '1' },
  });
  assert.equal(init.result.protocolVersion, '2025-11-25');
  mcp.notify('notifications/initialized');
  assert.equal(
    (await mcp.request('tools/list')).result.tools[0].name,
    'lab_command'
  );
  const cli = async (command) => {
    const r = await subprocess(
      'live-cli.mjs',
      relay.env,
      JSON.stringify(command)
    );
    assert.equal(r.stderr, '');
    return { exit: r.code, ...JSON.parse(r.stdout) };
  };
  const tool = async (command) => {
    const r = await mcp.request('tools/call', {
      name: 'lab_command',
      arguments: command,
    });
    return {
      isError: r.result.isError,
      value: JSON.parse(r.result.content[0].text),
    };
  };
  for (const [candidate, route, g, prefix, statusSelector] of [
    ['step', '/', 'lab', '#view-', '#status'],
    ['origin', '/origin', 'originLab', '#origin-', '#origin-status'],
  ]) {
    globalName = g;
    const snap = () => page.evaluate((g) => window[g].snapshot(), g);
    const first = (s) =>
      s.doc.content[0].content?.map((n) => n.text ?? '').join('') ?? '';
    const all = (s) => JSON.stringify(s.doc);
    const select = (id, text, from = 0, to = from) =>
      page.evaluate(
        ({ g, id, text, from, to }) => window[g].select(id, text, from, to),
        { g, id, text, from, to }
      );
    const boundary = (id) =>
      page.evaluate(({ g, id }) => window[g].boundary(id), { g, id });
    const insert = async (id, target, text, offset = 0) => {
      await select(id, target, offset);
      await page.keyboard.insertText(text);
    };
    const session = () => page.evaluate((g) => window[g].commandSession(), g);
    const command = async (data) => ({ session: await session(), ...data });
    const issueDesktop = (q) =>
      page.evaluate(({ g, q }) => window[g].liveCommand(q), { g, q });
    const check = async (id, title, body) => {
      await page.goto(`http://127.0.0.1:${app.address().port}${route}`);
      await page.waitForFunction((g) => window[g], g);
      await page.evaluate((g) => window[g].reset(), g);
      const pageErrors = [];
      const listener = (e) => pageErrors.push(e.message);
      page.on('pageerror', listener);
      try {
        const detail = await body();
        const s = await snap();
        assert.deepEqual(pageErrors, [], 'Unexpected page runtime error');
        assert.ok(
          Object.values(s.contexts).every(
            (c) => JSON.stringify(c.doc) === JSON.stringify(s.doc)
          ),
          'Views diverged'
        );
        results.push({
          id,
          candidate,
          title,
          status: detail?.status ?? 'pass',
          ...detail,
          version: s.version,
          snapshot: s,
          pageErrors,
        });
      } catch (e) {
        results.push({
          id,
          candidate,
          title,
          status: 'fail',
          reason: e.message,
          snapshot: await snap(),
          pageErrors,
        });
      } finally {
        page.off('pageerror', listener);
      }
    };
    const undoResult = async (expected, foreign) => {
      await select('A', 'Alpha');
      const before = await snap();
      await page.keyboard.press('ControlOrMeta+z');
      const after = await snap(),
        warning = await page.locator(statusSelector).innerText();
      assert.ok(all(after).includes(foreign), 'Foreign contribution lost');
      if (all(after) === all(before)) {
        if (warning.includes('UNDO_BLOCKED'))
          return {
            status: 'refused',
            reason: warning,
            undo: 'explicit-refusal',
            before,
            after,
          };
        return {
          status: 'gap',
          reason:
            'Undo made no change and supplied no refusal; retained history not demonstrated',
          undo: 'silent-no-op',
          before,
          after,
        };
      }
      if (expected) assert.equal(first(after), expected);
      return { status: 'pass', undo: 'applied', before, after };
    };
    await check(
      'HC-01',
      'nested foreign insertion: classify inverse vs refusal',
      async () => {
        await boundary('A');
        await insert('A', 'Alpha', 'abcd');
        await boundary('A');
        await insert('B', 'abcd', 'FOREIGN', 2);
        const result = await undoResult('FOREIGNAlpha beta', 'FOREIGN');
        await page.keyboard.press('ControlOrMeta+Shift+z');
        const redo = await snap();
        assert.equal(first(redo), 'abFOREIGNcdAlpha beta');
        return {
          ...result,
          redo: result.status === 'refused' ? 'no-op-after-refusal' : 'applied',
        };
      }
    );
    await check(
      'HC-02',
      'disjoint foreign text allows own undo and redo',
      async () => {
        await boundary('A');
        await insert('A', 'Alpha', 'AOWN');
        await boundary('A');
        await insert('B', 'Gamma', 'BOWN');
        const result = await undoResult('Alpha beta', 'BOWN');
        if (result.status === 'pass') {
          await page.keyboard.press('ControlOrMeta+Shift+z');
          assert.equal(first(await snap()), 'AOWNAlpha beta');
        }
        return result;
      }
    );
    await check(
      'HC-03',
      'foreign formatting: classify conservative refusal separately',
      async () => {
        await boundary('A');
        await insert('A', 'Alpha', 'AOWN');
        await boundary('A');
        await select('B', 'Gamma', 0, 5);
        await page.keyboard.press('ControlOrMeta+b');
        const result = await undoResult('Alpha beta', 'Gamma');
        assert.ok(
          all(await snap()).includes('strong'),
          'Foreign formatting lost'
        );
        return result;
      }
    );
    for (const axis of ['row', 'column'])
      await check(
        'HC-04-' + axis,
        'structural undo must retain foreign text in newly added cells',
        async () => {
          await select('A', 'Four', 2);
          await page
            .locator(prefix + `a button[data-table-handle="${axis}"]`)
            .click();
          const index = axis === 'row' ? 4 : 2;
          await page
            .locator(prefix + 'b td')
            .nth(index)
            .click();
          await page.keyboard.insertText('FOREIGN-CELL');
          const result = await undoResult(null, 'FOREIGN-CELL');
          return result;
        }
      );
    await check(
      'HC-05',
      'disjoint foreign edit after row append exposes overbroad refusals',
      async () => {
        await select('A', 'Four', 2);
        await page
          .locator(prefix + 'a button[data-table-handle="row"]')
          .click();
        await insert('B', 'Alpha', 'DISJOINT');
        const result = await undoResult('DISJOINTAlpha beta', 'DISJOINT');
        if (result.status === 'pass')
          assert.equal(await page.locator(prefix + 'a tr').count(), 2);
        return { ...result, safeDisjointFixture: true };
      }
    );
    await check(
      'HC-06',
      'destructive view close/remount retains context undo history',
      async () => {
        await boundary('A');
        await insert('A', 'Alpha', 'AOWN');
        await boundary('A');
        await insert('B', 'Gamma', 'BOWN');
        if (candidate === 'step') {
          await page.locator('#close-a').click();
          await page.locator('#close-a').click();
        } else await page.evaluate(() => originLab.recreateView('A'));
        assert.ok(all(await snap()).includes('AOWN'));
        const result = await undoResult('Alpha beta', 'BOWN');
        if (result.status !== 'pass') return result;
        await page.keyboard.press('ControlOrMeta+Shift+z');
        let after = await snap();
        assert.ok(all(after).includes('BOWN'));
        const redoApplied = first(after) === 'AOWNAlpha beta';
        const baseline = first(after);
        await boundary('A');
        await insert('A', 'Alpha', 'NEW-');
        await boundary('A');
        const fresh = await undoResult(baseline, 'BOWN');
        if (!redoApplied || fresh.status !== 'pass')
          return {
            ...result,
            status: 'gap',
            reason:
              'View remount loses redo and/or stops tracking subsequent edits',
            redo: redoApplied ? 'applied' : 'silent-no-op',
            newEditUndo: fresh.undo,
            after: await snap(),
          };
        return { ...result, redo: 'applied', newEditUndo: 'applied' };
      }
    );
    await check(
      'HC-07',
      'delayed peer delivery converges and preserves foreign edits on undo',
      async () => {
        await page.evaluate((g) => window[g].pause('B'), g);
        await insert('B', 'Gamma', 'BDELAY');
        await boundary('A');
        await insert('A', 'Alpha', 'AOWN');
        await boundary('A');
        await page.evaluate((g) => window[g].resume('B'), g);
        return undoResult('Alpha beta', 'BDELAY');
      }
    );
    await check(
      'HC-08',
      'CLI foreign insertion shares the live view authority/history boundary',
      async () => {
        await boundary('A');
        await insert('A', 'Alpha', 'abcd');
        await boundary('A');
        const q = await command({
          method: 'insert',
          id: 'cli-foreign',
          version: (await snap()).version,
          target: 'abcd',
          offset: 2,
          text: 'CLI-FOREIGN',
        });
        assert.equal((await cli(q)).ok, true);
        const result = await undoResult('CLI-FOREIGNAlpha beta', 'CLI-FOREIGN');
        return result;
      }
    );
    await check(
      'CP-01',
      'desktop, real CLI and persistent stdio MCP share one accepted owner',
      async () => {
        for (const [route, text, id] of [
          ['desktop', 'DESKTOP-', 'desktop'],
          ['cli', 'CLI-', 'cli'],
          ['mcp', 'MCP-', 'mcp'],
        ]) {
          const q = await command({
            method: 'insert',
            id,
            version: (await snap()).version,
            target: 'Alpha',
            offset: 0,
            text,
          });
          if (route === 'desktop')
            assert.equal((await issueDesktop(q)).accepted, true);
          if (route === 'cli') assert.equal((await cli(q)).ok, true);
          if (route === 'mcp') assert.equal((await tool(q)).isError, false);
        }
        const read = await command({ method: 'read' }),
          desktop = await issueDesktop(read),
          fromCLI = await cli(read),
          fromMCP = await tool(read);
        assert.deepEqual(fromCLI.result, desktop);
        assert.deepEqual(fromMCP.value, desktop);
        assert.equal(first(await snap()), 'DESKTOP-CLI-MCP-Alpha beta');
        return {
          owner: 'same in-page authority; test relay has no document',
          transport:
            'CLI subprocess + persistent stdio MCP process + desktop dispatcher',
        };
      }
    );
    await check(
      'CP-02',
      'operation retry crosses CLI/MCP and keeps one stable receipt',
      async () => {
        const q = await command({
            method: 'insert',
            id: 'retry',
            version: 0,
            target: 'Alpha',
            offset: 0,
            text: 'ONCE-',
          }),
          one = await cli(q),
          before = await snap(),
          retry = await tool(q);
        assert.equal(retry.isError, false);
        assert.deepEqual(retry.value, one.result);
        assert.deepEqual(await snap(), before);
        const bad = await tool({ ...q, text: 'DIFFERENT' });
        assert.equal(bad.isError, true);
        assert.equal(bad.value.error, 'OPERATION_ID_REUSED');
        assert.deepEqual(await snap(), before);
        const outcome = await tool(
          await command({ method: 'outcome', id: 'retry' })
        );
        assert.deepEqual(outcome.value, one.result);
      }
    );
    await check(
      'CP-03',
      'competing stale commands cannot silently overwrite accepted state',
      async () => {
        const one = await command({
            method: 'insert',
            id: 'race1',
            version: 0,
            target: 'Alpha',
            offset: 0,
            text: 'ONE-',
          }),
          two = { ...one, id: 'race2', text: 'TWO-' };
        const [a, b] = await Promise.all([cli(one), tool(two)]);
        const successes = Number(a.ok) + Number(!b.isError);
        assert.equal(successes, 1);
        assert.ok((a.error ?? b.value.error) === 'STALE_VERSION');
        assert.ok(
          first(await snap()) === 'ONE-Alpha beta' ||
            first(await snap()) === 'TWO-Alpha beta'
        );
      }
    );
    await check(
      'CP-04',
      'lost CLI response resolves via MCP outcome without duplicating accepted edit',
      async () => {
        const q = await command({
          method: 'insert',
          id: 'lost-response',
          version: 0,
          target: 'Alpha',
          offset: 0,
          text: 'ONCE-',
        });
        relay.dropNextReply();
        const lost = await cli(q);
        assert.equal(lost.ok, false);
        assert.equal(lost.error, 'TRANSPORT_OUTCOME_UNKNOWN');
        const outcome = await tool(
          await command({ method: 'outcome', id: 'lost-response' })
        );
        assert.equal(outcome.value.accepted, true);
        assert.deepEqual((await cli(q)).result, outcome.value);
        assert.equal(first(await snap()), 'ONCE-Alpha beta');
      }
    );
    await check(
      'CP-05',
      'owner reset rejects old session commands instead of applying them to new state',
      async () => {
        const q = await command({
          method: 'insert',
          id: 'old',
          version: 0,
          target: 'Alpha',
          offset: 0,
          text: 'OLD-',
        });
        await page.evaluate((g) => window[g].reset(), g);
        const before = await snap();
        assert.equal((await cli(q)).error, 'STALE_SESSION');
        assert.deepEqual(await snap(), before);
      }
    );
    await check(
      'CP-06',
      'MCP notification/invalid requests do not mutate the live owner',
      async () => {
        const before = await snap();
        const q = await command({
          method: 'insert',
          id: 'notification-must-not-write',
          version: before.version,
          target: 'Alpha',
          offset: 0,
          text: 'BAD-',
        });
        mcp.notify('tools/call', { name: 'lab_command', arguments: q });
        await mcp.request('ping');
        assert.deepEqual(await snap(), before);
        const unknown = await mcp.request('tools/call', {
          name: 'missing',
          arguments: q,
        });
        assert.equal(unknown.error.code, -32602);
        const invalid = await tool({ ...q, extra: true });
        assert.equal(invalid.value.error, 'INVALID_REQUEST');
        assert.deepEqual(await snap(), before);
      }
    );
  }
  // This relay is private experiment HTTP, not MCP HTTP. Authentication and Origin checks
  // prevent unrelated browser pages from issuing commands to the test owner.
  const denied = await fetch(relay.env.CLUTTER_LAB_RELAY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(denied.status, 403);
  const originDenied = await fetch(relay.env.CLUTTER_LAB_RELAY_URL, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + relay.env.CLUTTER_LAB_RELAY_TOKEN,
      origin: 'https://unrelated.invalid',
      'content-type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(originDenied.status, 403);
  assert.deepEqual(processErrors, []);
  for (const candidate of ['step', 'origin'])
    assert.deepEqual(
      results.filter((r) => r.candidate === candidate).map((r) => r.id),
      contract.cases.map((c) => c.id)
    );
  const qualifications = results.filter(
    (r) =>
      r.status === 'fail' ||
      r.status === 'gap' ||
      (r.status === 'refused' &&
        contract.cases.find((c) => c.id === r.id).requiresAppliedInverse)
  );
  const summary = Object.fromEntries(
    ['step', 'origin'].map((candidate) => [
      candidate,
      Object.fromEntries(
        ['pass', 'refused', 'gap', 'fail'].map((status) => [
          status,
          results.filter(
            (r) => r.candidate === candidate && r.status === status
          ).length,
        ])
      ),
    ])
  );
  jsonFile('comparison-results.json', {
    mode: strict ? 'strict-qualification' : 'discovery',
    summary,
    sliceQualified: qualifications.length === 0,
    openQualificationCases: qualifications.map((r) => ({
      candidate: r.candidate,
      id: r.id,
      status: r.status,
      reason: r.reason,
    })),
    runtime: await browser.version(),
    os: process.platform,
    scope:
      'Matched synthetic browser histories + real CLI/MCP processes through a Playwright test relay; no production IPC/disk/native claim',
    results,
    relayGuards: { missingToken: 'denied', foreignOrigin: 'denied' },
    processErrors,
  });
  for (const r of results)
    console.log(
      `${r.status}: ${r.candidate} ${r.id} ${r.title}${r.reason ? ' — ' + r.reason : ''}`
    );
  // Gaps/refusals are findings, never acceptance passes. Unexpected corruption fails the run.
  if (
    results.some((r) => r.status === 'fail') ||
    (strict && qualifications.length)
  )
    process.exitCode = 1;
} finally {
  await mcp?.close();
  await relay?.close();
  await browser?.close();
  await new Promise((resolve) => app.close(resolve));
}
