import test from 'node:test';
import assert from 'node:assert/strict';
import { liveCommands } from '../src/live-command.mjs';
import { Authority } from '../src/authority.mjs';
import { execute } from '../src/api.mjs';
import { OriginAuthority } from '../src/origin-authority.mjs';
import { fixture } from '../src/schema.mjs';
for (const kind of ['step', 'origin']) {
  function setup() {
    const a =
      kind === 'step' ? new Authority(fixture()) : new OriginAuthority();
    const read = () => ({
      version: a.version,
      doc: kind === 'step' ? a.doc.toJSON() : a.read().toJSON(),
    });
    const command = liveCommands(
      {
        read,
        insert: (q) =>
          kind === 'step'
            ? execute(a, (({ session, ...rest }) => rest)(q))
            : a.insertExternal(q),
      },
      'session-test'
    );
    return { a, command, read, close: () => a.destroy?.() };
  }
  test(
    kind +
      ' shared ingress retries keep the first receipt and do not duplicate text',
    () => {
      const s = setup();
      try {
        const request = {
          session: 'session-test',
          method: 'insert',
          id: 'one',
          version: 0,
          target: 'Alpha',
          offset: 0,
          text: 'FIRST',
        };
        const result = s.command(request);
        assert.equal(result.accepted, true);
        s.command({
          ...request,
          id: 'two',
          version: s.read().version,
          target: 'Gamma',
          text: 'SECOND',
        });
        const before = s.read();
        assert.deepEqual(s.command(request), result);
        assert.deepEqual(
          s.command({ method: 'outcome', session: 'session-test', id: 'one' }),
          result
        );
        assert.deepEqual(s.read(), before);
        assert.throws(
          () => s.command({ ...request, text: 'CHANGED' }),
          /OPERATION_ID_REUSED/
        );
        assert.deepEqual(s.read(), before);
      } finally {
        s.close();
      }
    }
  );
  test(
    kind +
      ' shared ingress rejects stale/session/extra-field requests before mutation',
    () => {
      const s = setup();
      try {
        const req = {
          session: 'session-test',
          method: 'insert',
          id: 'one',
          version: 0,
          target: 'Alpha',
          offset: 0,
          text: 'X',
        };
        s.command(req);
        const before = s.read();
        for (const [q, error] of [
          [{ ...req, id: 'two' }, /STALE_VERSION/],
          [{ ...req, session: 'old' }, /STALE_SESSION/],
          [{ ...req, extra: true }, /INVALID_REQUEST/],
          [{ ...req, offset: -1 }, /INVALID_REQUEST/],
          [{ session: 'session-test', method: '__proto__' }, /INVALID_REQUEST/],
        ])
          assert.throws(() => s.command(q), error);
        assert.deepEqual(s.read(), before);
      } finally {
        s.close();
      }
    }
  );
  test(
    kind +
      ' caller mutation of reads/receipts cannot mutate authority or retry outcomes',
    () => {
      const s = setup();
      try {
        const request = {
          session: 'session-test',
          method: 'insert',
          id: 'receipt',
          version: 0,
          target: 'Alpha',
          offset: 0,
          text: 'X',
        };
        const receipt = s.command(request),
          original = { ...receipt };
        receipt.version = 999;
        receipt.accepted = false;
        const read = s.command({ session: 'session-test', method: 'read' });
        read.doc.content[0].content[0].text = 'CORRUPTED';
        read.doc.content[0].attrs = { unexpected: true };
        read.doc.content[2].attrs.properties.Priority.value = 'CORRUPTED';
        assert.deepEqual(s.command(request), original);
        assert.ok(!JSON.stringify(s.read()).includes('CORRUPTED'));
        assert.ok(!JSON.stringify(s.read()).includes('unexpected'));
      } finally {
        s.close();
      }
    }
  );
}
