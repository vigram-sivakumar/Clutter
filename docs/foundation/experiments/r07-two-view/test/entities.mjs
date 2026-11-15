import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  cpSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import * as Y from 'yjs';
import { prosemirrorToYXmlFragment } from 'y-prosemirror';
import * as model from '../entities/model.mjs';
import {
  noteSchema,
  taskSchema,
  document,
  paragraph,
  slot,
  parse,
} from '../entities/schema.mjs';
import { owner, cli, mcp } from './entity-support.mjs';
const base = mkdtempSync(join(tmpdir(), 'clutter-entities-')),
  results = [],
  owners = new Set();
let profile;
async function start(dir, { init = false, ...rest } = {}) {
  const o = await owner(dir, { init, ...rest });
  if (o.child) owners.add(o);
  profile ??= o.profile;
  return o;
}
async function fresh() {
  return start(mkdtempSync(join(base, 'store-')), { init: true });
}
async function check(id, title, run) {
  try {
    const detail = await run();
    results.push({ id, title, status: 'pass', detail });
    console.log(id, 'pass', title);
  } catch (e) {
    results.push({ id, title, status: 'fail', error: e.stack });
    throw e;
  }
}
const move = (
  version = 0,
  fromNoteId = 'n1',
  toNoteId = 'n2',
  operationId = randomUUID()
) => ({
  method: 'move_task',
  operationId,
  expectedVersion: version,
  taskId: 't1',
  fromNoteId,
  toNoteId,
  index: 1,
});
const applied = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.result;
};
const refused = (r, error) => {
  assert.equal(r.ok, false);
  assert.equal(r.error, error);
};
const taskEdit = (version, title = 'New title') => ({
  method: 'edit_task',
  operationId: randomUUID(),
  expectedVersion: version,
  taskId: 't1',
  title,
  body: document(paragraph('t1-p1', 'Updated task body')),
  properties: {
    DueDate: { type: 'date', value: '2026-12-01' },
    Priority: { type: 'text', value: 'Low' },
  },
});
try {
  await check(
    'EN-01',
    'Canonical independent task and derived note projection',
    async () => {
      const o = await fresh(),
        r = await o.read();
      model.validateState(r.state);
      assert.deepEqual(model.placements(r.state), {
        t1: { noteId: 'n1', blockId: 'slot-t1' },
      });
      const slotRecord = r.state.notes.n1.body.content[1];
      assert.deepEqual(Object.keys(slotRecord).sort(), ['attrs', 'type']);
      assert.deepEqual(
        model.projectNote(r.state, 'n1').blocks[1].task,
        r.state.tasks.t1
      );
      assert.equal(Object.keys(r.state.tasks).length, 1);
      return {
        bodiesStoredIn: 'one task Y fragment',
        placementIndex: 'derived',
      };
    }
  );
  await check(
    'EN-02',
    'Atomic note-to-note move retains task identity body and properties',
    async () => {
      const o = await fresh(),
        before = await o.read(),
        receipt = applied(await o.rpc(move()));
      const after = await o.read();
      assert.equal(receipt.version, 1);
      assert.equal(after.version, 1);
      assert.deepEqual(after.state.tasks, before.state.tasks);
      assert.deepEqual(model.placements(after.state), {
        t1: { noteId: 'n2', blockId: 'slot-t1' },
      });
      assert.equal(after.state.notes.n1.body.content.length, 1);
      assert.equal(after.state.notes.n2.body.content.length, 2);
      return {
        rootCommits: 1,
        activePlacements: 1,
        canonicalTaskUnchanged: true,
      };
    }
  );
  await check(
    'EN-03',
    'Detached task page remains editable and can move back from inbox',
    async () => {
      const o = await fresh();
      applied(await o.rpc({ ...move(0, 'n1', 'inbox'), index: 0 }));
      let r = await o.read();
      assert.deepEqual(model.placements(r.state), {});
      assert.ok(r.state.tasks.t1);
      applied(await o.rpc(taskEdit(1)));
      applied(await o.rpc(move(2, 'inbox', 'n2')));
      r = await o.read();
      assert.equal(r.state.tasks.t1.title, 'New title');
      assert.equal(model.placements(r.state).t1.noteId, 'n2');
      refused(
        await o.rpc({ ...move(3), spaceId: 'another-space' }),
        'WRONG_DESTINATION'
      );
      return {
        independentPage: true,
        sameTaskId: 't1',
        crossSpaceMove: 'refused',
      };
    }
  );
  await check(
    'EN-04',
    'Duplicate dangling nested and mismatched entity identities rejected',
    async () => {
      for (const [kind, expected] of [
        ['duplicate', 'DUPLICATE'],
        ['dangling', 'DANGLING_TASK'],
        ['block', 'DUPLICATE'],
        ['nested', 'Invalid content'],
      ]) {
        const s = model.initial(),
          d = model.ydoc(s.payload);
        try {
          if (kind === 'nested') {
            const fragment = d.getMap('tasks').get('t1').get('body');
            prosemirrorToYXmlFragment(
              parse(noteSchema, document(slot('t1'))),
              fragment
            );
          } else {
            const body =
              kind === 'duplicate'
                ? document(paragraph('n2-p1', 'Delivery'), slot('t1'))
                : kind === 'dangling'
                  ? document(slot('missing-task'))
                  : document(paragraph('n1-p1', 'Duplicate block'));
            prosemirrorToYXmlFragment(
              parse(noteSchema, body),
              d.getMap('notes').get('n2').get('body')
            );
          }
          assert.throws(() => model.stateOf(d), new RegExp(expected));
        } finally {
          d.destroy();
        }
      }
      const o = await fresh(),
        before = await o.read();
      refused(
        await o.rpc({
          method: 'edit_note',
          operationId: randomUUID(),
          expectedVersion: 0,
          noteId: 'n2',
          body: document(slot('t1')),
        }),
        'TASK_PLACEMENT_CONFLICT'
      );
      refused(await o.rpc({ ...move(), index: 999 }), 'INVALID_INDEX');
      assert.deepEqual((await o.read()).state, before.state);
      const mismatch = structuredClone(before.state);
      mismatch.tasks.t1.title = 'forged projection';
      assert.throws(
        () => model.validateState(mismatch),
        /ENTITY_PROJECTION_MISMATCH/
      );
      return { forbiddenReferences: true, invalidStagingNeverPublished: true };
    }
  );
  await check(
    'EN-05',
    'Pinned historical note resolves task against its own immutable root',
    async () => {
      const o = await fresh(),
        old = await o.read();
      applied(
        await o.rpc({
          method: 'pin_version',
          operationId: randomUUID(),
          version: 0,
        })
      );
      applied(await o.rpc(move()));
      applied(await o.rpc(taskEdit(1)));
      const historical = applied(
        await o.rpc({ method: 'read_version', version: 0 })
      );
      assert.equal(historical.pinned, true);
      assert.deepEqual(historical.state, old.state);
      assert.equal(
        model.projectNote(historical.state, 'n1').blocks[1].task.title,
        'Send proposal'
      );
      assert.equal(
        model.projectNote((await o.read()).state, 'n2').blocks[1].task.title,
        'New title'
      );
      return {
        historicalTask: 'original',
        currentTask: 'newer',
        historicalPlacement: 'n1',
        currentPlacement: 'n2',
      };
    }
  );
  await check(
    'EN-06',
    'Historical restore refuses task reclaim after a move or detach',
    async () => {
      for (const destination of ['n2', 'inbox']) {
        const o = await fresh();
        applied(
          await o.rpc({
            ...move(0, 'n1', destination),
            index: destination === 'inbox' ? 0 : 1,
          })
        );
        const before = await o.read(),
          command = {
            method: 'restore_note',
            operationId: randomUUID(),
            expectedVersion: 1,
            noteId: 'n1',
            version: 0,
          };
        refused(await o.rpc(command), 'TASK_PLACEMENT_CONFLICT');
        refused(
          await o.rpc({
            method: 'restore_version',
            operationId: randomUUID(),
            expectedVersion: 1,
            version: 0,
          }),
          'UNSUPPORTED_ENTITY_COMMAND'
        );
        assert.deepEqual(await o.read(), before);
        assert.equal(
          applied(
            await o.rpc({ method: 'outcome', operationId: command.operationId })
          ),
          null
        );
      }
      return {
        moveConflict: 'refused without root or receipt',
        detachConflict: 'refused without root or receipt',
      };
    }
  );
  await check(
    'EN-07',
    'Safe note restore preserves newer independently owned task body/properties',
    async () => {
      const o = await fresh();
      applied(
        await o.rpc({
          method: 'edit_note',
          operationId: randomUUID(),
          expectedVersion: 0,
          noteId: 'n1',
          body: document(paragraph('n1-p1', 'Changed note'), slot('t1')),
        })
      );
      applied(await o.rpc(taskEdit(1)));
      const before = await o.read();
      applied(
        await o.rpc({
          method: 'restore_note',
          operationId: randomUUID(),
          expectedVersion: 2,
          noteId: 'n1',
          version: 0,
        })
      );
      const after = await o.read();
      assert.equal(
        after.state.notes.n1.body.content[0].content[0].text,
        'Planning draft'
      );
      assert.deepEqual(after.state.tasks, before.state.tasks);
      assert.equal(model.placements(after.state).t1.noteId, 'n1');
      return { noteContentRestored: true, canonicalTaskNotRewound: true };
    }
  );
  await check(
    'EN-08',
    'Restore cannot detach a task inserted after the historical version',
    async () => {
      const o = await fresh();
      applied(await o.rpc(move()));
      const before = await o.read();
      refused(
        await o.rpc({
          method: 'restore_note',
          operationId: randomUUID(),
          expectedVersion: 1,
          noteId: 'n2',
          version: 0,
        }),
        'TASK_PLACEMENT_CONFLICT'
      );
      assert.deepEqual(await o.read(), before);
      return { noSilentRelocation: true };
    }
  );
  await check(
    'EN-09',
    'Stale restore preview and competing moves recheck current committed ownership',
    async () => {
      const o = await fresh();
      const preview = await o.read();
      applied(await o.rpc(move()));
      refused(
        await o.rpc({
          method: 'restore_note',
          operationId: randomUUID(),
          expectedVersion: preview.version,
          noteId: 'n1',
          version: 0,
        }),
        'REVISION_CONFLICT'
      );
      const q = await fresh(),
        responses = await Promise.all([
          q.rpc(move()),
          q.rpc({ ...move(0, 'n1', 'inbox'), index: 0 }),
        ]);
      assert.equal(responses.filter((r) => r.ok).length, 1);
      assert.equal(responses.find((r) => !r.ok).error, 'REVISION_CONFLICT');
      const root = await q.read();
      model.validateState(root.state);
      assert.equal(root.version, 1);
      return { stalePreview: 'refused', competingMoves: 'one effect' };
    }
  );
  await check(
    'EN-10',
    'Real process death around multi-note commit yields old-or-new closure and exact retry',
    async () => {
      const evidence = [];
      for (const phase of [
        'before_begin',
        'after_revision',
        'after_outcome',
        'before_commit',
        'after_commit',
        'before_reply',
      ]) {
        let o = await fresh();
        const dir = o.dir,
          command = move();
        await o.control('fault', { phase, operationId: command.operationId });
        const request = o.rpc(command);
        await o.next((m) => m.type === 'phase' && m.phase === phase);
        await o.stop();
        await request;
        o = await start(dir);
        const before = await o.read(),
          committed = ['after_commit', 'before_reply'].includes(phase);
        assert.equal(before.version, committed ? 1 : 0);
        assert.equal(
          model.placements(before.state).t1.noteId,
          committed ? 'n2' : 'n1'
        );
        const prior = applied(
          await o.rpc({ method: 'outcome', operationId: command.operationId })
        );
        assert.equal(prior !== null, committed);
        const receipt = applied(await o.rpc(command));
        assert.equal(receipt.version, 1);
        if (prior) assert.deepEqual(receipt, prior);
        assert.deepEqual(applied(await o.rpc(command)), receipt);
        assert.equal((await o.read()).version, 1);
        refused(
          await o.rpc({ ...command, toNoteId: 'inbox', index: 0 }),
          'OPERATION_ID_REUSED'
        );
        evidence.push({
          phase,
          recoveredVersion: before.version,
          retryVersion: receipt.version,
        });
      }
      return evidence;
    }
  );
  await check(
    'EN-11',
    'Failed commit leaves both notes and task untouched; same command retries once',
    async () => {
      const o = await fresh(),
        before = await o.read(),
        command = move();
      await o.control('fail_writes', { value: true });
      refused(await o.rpc(command), 'INJECTED_SAVE_FAILURE');
      assert.deepEqual(await o.read(), before);
      assert.equal(
        applied(
          await o.rpc({ method: 'outcome', operationId: command.operationId })
        ),
        null
      );
      await o.control('fail_writes', { value: false });
      assert.equal(applied(await o.rpc(command)).version, 1);
      return { uncommittedSourceRemoval: false };
    }
  );
  await check(
    'EN-12',
    'Desktop-facing RPC CLI and MCP share one move operation and canonical task page',
    async () => {
      const o = await fresh(),
        adapter = await mcp(o);
      try {
        const tools = await adapter.request('tools/list', {});
        assert.ok(JSON.stringify(tools.result).includes('move_task'));
        const command = move(),
          receipt = applied(await cli(o, command));
        assert.deepEqual(applied(await o.rpc(command)), receipt);
        assert.deepEqual(applied(await adapter.command(command)), receipt);
        const edit = taskEdit(1, 'Edited through MCP');
        applied(await adapter.command(edit));
        const r = applied(await cli(o, { method: 'read' }));
        assert.equal(r.version, 2);
        assert.equal(r.state.tasks.t1.title, 'Edited through MCP');
        assert.equal(
          model.projectNote(r.state, 'n2').blocks[1].task.title,
          'Edited through MCP'
        );
        return {
          rpcCliMcp: 'one reducer/receipt',
          canonicalTaskPage: 'same body and properties',
        };
      } finally {
        await adapter.stop();
      }
    }
  );
  await check(
    'EN-13',
    'Stored roots are single Y BLOBs; SQL receipt/history closure survives restart',
    async () => {
      let o = await fresh();
      applied(await o.rpc(move()));
      applied(await o.rpc(taskEdit(1)));
      const dir = o.dir;
      await o.stop();
      const db = new DatabaseSync(join(dir, 'vault.sqlite'), {
        readOnly: true,
      });
      let rows;
      try {
        rows = db
          .prepare(
            'SELECT version,state,hash,typeof(state) AS type FROM revisions ORDER BY version'
          )
          .all();
        assert.equal(rows.length, 3);
        for (const r of rows) {
          assert.equal(r.type, 'blob');
          model.validateState(model.decode(r.state));
          assert.equal(
            createHash('sha256').update(r.state).digest('hex'),
            r.hash
          );
        }
        assert.deepEqual(
          db
            .prepare('PRAGMA table_info(revisions)')
            .all()
            .map((r) => r.name),
          ['version', 'parent', 'state', 'hash', 'operation_id']
        );
        assert.equal(
          db.prepare('SELECT count(*) AS n FROM outcomes').get().n,
          2
        );
      } finally {
        db.close();
      }
      o = await start(dir);
      assert.equal((await o.read()).version, 2);
      return {
        rootRows: 3,
        stateStorage: 'one Y BLOB per root',
        projectionJsonColumn: false,
      };
    }
  );
  await check(
    'EN-14',
    'Unknown codec and typed property mismatch refuse without replacing saved state',
    async () => {
      const o = await fresh(),
        before = await o.read();
      refused(
        await o.rpc({
          ...taskEdit(0),
          properties: { DueDate: { type: 'date', value: 'tomorrow' } },
        }),
        'INVALID_PROPERTY_VALUE'
      );
      const invalid = taskEdit(0);
      invalid.body = document(slot('t1'));
      const r = await o.rpc(invalid);
      assert.equal(r.ok, false);
      assert.deepEqual(await o.read(), before);
      await o.stop();
      const oldProfile = await start(o.dir, {
        entry: 'durable/owner.mjs',
        expectedError: true,
      });
      assert.equal(oldProfile.error, 'UNMARKED_STORE');
      const copy = join(base, 'bad-codec');
      cpSync(o.dir, copy, { recursive: true });
      const db = new DatabaseSync(join(copy, 'vault.sqlite'));
      const bad = Buffer.from('unknown-codec');
      db.prepare('UPDATE revisions SET state=?,hash=? WHERE version=0').run(
        bad,
        createHash('sha256').update(bad).digest('hex')
      );
      db.close();
      const failed = await start(copy, { expectedError: true });
      assert.equal(failed.error, 'UNSUPPORTED_ENTITY_CODEC');
      const readback = new DatabaseSync(join(copy, 'vault.sqlite'), {
        readOnly: true,
      });
      try {
        assert.deepEqual(
          Buffer.from(
            readback
              .prepare('SELECT state FROM revisions WHERE version=0')
              .get().state
          ),
          bad
        );
      } finally {
        readback.close();
      }
      return {
        typedMismatch: 'refused',
        nestedTask: 'refused',
        unknownEncoding: 'fail closed; original bytes retained',
      };
    }
  );
} catch (e) {
  process.exitCode = 1;
  console.error(e.stack);
} finally {
  for (const o of owners) await o.stop();
  mkdirSync('artifacts', { recursive: true });
  const output = process.env.ENTITY_RESULT ?? 'artifacts/entity-results.json';
  writeFileSync(
    output,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        gate: 'JG-12',
        scope:
          'Proposed normalized entity/Y root through existing SQLite owner; no native binding or production acceptance',
        profile,
        contractSha256: createHash('sha256')
          .update(readFileSync('entities/CONTRACT.md'))
          .digest('hex'),
        results,
      },
      null,
      2
    ) + '\n'
  );
  console.log('Report', output);
}
