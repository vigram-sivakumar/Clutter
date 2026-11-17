import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrap } from '../../../apps/desktop/host/bootstrap.mjs';
import {
  windowArguments,
  windowDirectory,
  readWindowRecord,
} from '../../../apps/desktop/host/window-records.mjs';
const config = {
  url: 'http://127.0.0.1:12345/',
  token: 'private',
  spaceId: 's',
  windowId: 'parent',
  bootNonce: 'nonce',
};
function host(override) {
  const messages = [],
    timers = new Map();
  let next = 0;
  const context = vm.createContext({
    location: {
      origin: 'http://127.0.0.1:12345',
      pathname: '/',
      set href(value) {
        const url = new URL(value);
        messages.push(JSON.parse(url.searchParams.get('m')));
      },
    },
    setTimeout: (fn) => {
      timers.set(++next, fn);
      return next;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  if (override) context.__clutterNativeWindowConfig = override;
  vm.runInContext(bootstrap(config), context);
  return { context, messages, timers };
}
test('window bridge scopes native requests/replies and close nonces; child initialization uses its own window context', async () => {
  const {
    context: c,
    messages,
    timers,
  } = host({
    ...config,
    url: 'http://127.0.0.1:12345',
    windowId: 'child',
    bootNonce: 'childnonce',
    initialPageId: 'note',
  });
  assert.equal(c.__clutterHost.windowId, 'child');
  assert.equal(c.__clutterHost.initialPageId, 'note');
  const first = c.__clutterOpenWindow({ pageId: 'note', requestId: 'op' });
  assert.equal(
    c.__clutterOpenWindow({ pageId: 'note', requestId: 'op' }),
    first
  );
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0], {
    event: 'open-window',
    pageId: 'note',
    requestId: 'op',
    windowId: 'child',
    bootNonce: 'childnonce',
  });
  assert(!JSON.stringify(messages).includes('private'));
  c.__clutterHostReply({ requestId: 'other', ok: true });
  assert.equal(timers.size, 1);
  c.__clutterHostReply({
    requestId: 'op',
    ok: true,
    value: { windowId: 'next' },
  });
  assert.equal((await first).windowId, 'next');
  assert.equal(timers.size, 0);
  await assert.rejects(
    c.__clutterOpenWindow({ pageId: '../bad', requestId: 'op2' }),
    /INVALID_WINDOW_REQUEST/
  );
  c.clutterWindow = {
    prepareClose: async () => ({ safe: false }),
    resume: () => {
      c.resumed = true;
    },
  };
  await c.__clutterClose('guard');
  assert.deepEqual(messages.at(-1), {
    event: 'close',
    guardNonce: 'guard',
    safe: false,
    windowId: 'child',
    bootNonce: 'childnonce',
  });
  c.__clutterResume();
  assert.equal(c.resumed, true);
  const unknown = c.__clutterOpenWindow({
    pageId: 'note',
    requestId: 'unknown',
  });
  [...timers.values()][0]();
  await assert.rejects(unknown, /WINDOW_OUTCOME_UNKNOWN/);
});
test('developer window reopen is explicitly scoped to its existing session and validates opaque ID records', () => {
  const base = mkdtempSync(join(tmpdir(), 'clutter-window57-'));
  try {
    assert.deepEqual(windowArguments(['--reopen', '--window-id', 'child']), {
      flags: ['--reopen'],
      windowId: 'child',
    });
    for (const args of [
      ['--new', '--window-id', 'child'],
      ['--reopen', '--window-id', '../child'],
      ['--reopen', '--reopen'],
      ['--oops'],
    ])
      assert.throws(() => windowArguments(args));
    const directory = windowDirectory(base, 'session1');
    writeFileSync(
      join(directory, 'child.json'),
      JSON.stringify({ windowId: 'child', initialPageId: 'note' }),
      { mode: 0o600 }
    );
    assert.deepEqual(readWindowRecord(directory, 'child'), {
      windowId: 'child',
      initialPageId: 'note',
    });
    assert.throws(() =>
      readWindowRecord(windowDirectory(base, 'session2'), 'child')
    );
    writeFileSync(
      join(directory, 'child.json'),
      JSON.stringify({ windowId: 'other', initialPageId: 'note' })
    );
    assert.throws(
      () => readWindowRecord(directory, 'child'),
      /INVALID_WINDOW_RECORD/
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
