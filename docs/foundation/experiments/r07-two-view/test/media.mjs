import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  chmodSync,
  unlinkSync,
  symlinkSync,
  lstatSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../durable/store.mjs';
import * as model from '../media/model.mjs';
import { hash, validateBytes } from '../media/formats.mjs';
import { directories } from '../media/files.mjs';
import { owner, cli, mcp } from './entity-support.mjs';
const png = readFileSync('media/fixtures/tiny.png'),
  pdf = readFileSync('media/fixtures/tiny.pdf');
const base = mkdtempSync(join(tmpdir(), 'clutter-media-')),
  results = [],
  owners = new Set();
let profile;
const freshDir = () => mkdtempSync(join(base, 'store-'));
async function start(dir, { init = false, ...rest } = {}) {
  const o = await owner(dir, { init, entry: 'media/owner.mjs', ...rest });
  if (o.child) owners.add(o);
  profile ??= o.profile;
  return o;
}
const fresh = () => start(freshDir(), { init: true });
const applied = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.result;
};
const refused = (r, error) => {
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(r.error, error);
};
const importAsset = (
  version = 0,
  {
    bytes = png,
    mime = 'image/png',
    attachmentId = 'a1',
    pageId = 'n1',
    role = 'body',
    operationId = randomUUID(),
  } = {}
) => ({
  method: 'import_asset',
  operationId,
  expectedVersion: version,
  pageId,
  attachmentId,
  role,
  name: mime === 'image/png' ? 'pixel.png' : 'page.pdf',
  mime,
  base64: bytes.toString('base64'),
});
const remove = (version, attachmentId = 'a1') => ({
  method: 'remove_asset',
  operationId: randomUUID(),
  expectedVersion: version,
  attachmentId,
});
const read = (version, attachmentId = 'a1') => ({
  method: 'read_asset',
  version,
  attachmentId,
});
const objectPath = (o, bytes = png) =>
  join(o.dir, 'media', 'objects', hash(bytes));
async function check(id, title, fn) {
  try {
    const detail = await fn();
    results.push({ id, title, status: 'pass', detail });
    console.log(id, 'pass', title);
  } catch (e) {
    results.push({ id, title, status: 'fail', error: e.stack });
    throw e;
  }
}
try {
  await check(
    'MA-01',
    'Notes and task pages share body/cover assets; task move keeps ownership',
    async () => {
      validateBytes(png, 'image/png');
      validateBytes(pdf, 'application/pdf');
      const o = await fresh();
      applied(await o.rpc(importAsset()));
      applied(
        await o.rpc(
          importAsset(1, {
            bytes: pdf,
            mime: 'application/pdf',
            attachmentId: 'task-pdf',
            pageId: 't1',
          })
        )
      );
      applied(
        await o.rpc(
          importAsset(2, {
            attachmentId: 'task-cover',
            pageId: 't1',
            role: 'cover',
          })
        )
      );
      applied(
        await o.rpc({
          method: 'move_task',
          operationId: randomUUID(),
          expectedVersion: 3,
          taskId: 't1',
          fromNoteId: 'n1',
          toNoteId: 'n2',
          index: 1,
        })
      );
      const r = await o.read();
      assert.equal(r.version, 4);
      assert.equal(r.state.assetLinks['task-cover'].pageId, 't1');
      assert.equal(r.state.assetLinks['task-pdf'].pageId, 't1');
      assert.equal(Object.keys(r.state.assets).length, 2);
      assert.deepEqual(
        Buffer.from(applied(await o.rpc(read(4, 'task-pdf'))).base64, 'base64'),
        pdf
      );
      assert.deepEqual(
        Buffer.from(
          applied(await o.rpc(read(4, 'task-cover'))).base64,
          'base64'
        ),
        png
      );
      refused(
        await o.rpc(
          importAsset(4, {
            attachmentId: 'second-cover',
            pageId: 't1',
            role: 'cover',
          })
        ),
        'COVER_EXISTS'
      );
      return {
        firstClassPageIds: ['n1', 't1'],
        roles: ['body', 'cover'],
        objects: 2,
        taskMoveCopiedBytes: false,
      };
    }
  );
  await check(
    'MA-02',
    'Content-address reuse and pinned historical media survive all current removals',
    async () => {
      const o = await fresh();
      applied(await o.rpc(importAsset()));
      applied(
        await o.rpc({
          method: 'pin_version',
          operationId: randomUUID(),
          version: 1,
        })
      );
      const inode = lstatSync(objectPath(o)).ino;
      applied(
        await o.rpc(importAsset(1, { attachmentId: 'a2', pageId: 't1' }))
      );
      assert.equal(lstatSync(objectPath(o)).ino, inode);
      assert.equal(readdirSync(join(o.dir, 'media', 'objects')).length, 1);
      applied(await o.rpc(remove(2)));
      assert.equal(Object.keys((await o.read()).state.assets).length, 1);
      applied(await o.rpc(remove(3, 'a2')));
      const current = await o.read();
      assert.deepEqual(current.state.assets, {});
      assert.deepEqual(current.state.assetLinks, {});
      assert.ok(existsSync(objectPath(o)));
      assert.equal(
        applied(await o.rpc({ method: 'read_version', version: 1 })).pinned,
        true
      );
      assert.equal(
        applied(await o.rpc(read(1))).base64,
        png.toString('base64')
      );
      refused(await o.rpc(read(4)), 'ATTACHMENT_NOT_FOUND');
      await o.stop();
      const reopened = await start(o.dir);
      assert.equal(
        applied(await reopened.rpc(read(1))).base64,
        png.toString('base64')
      );
      return {
        onePhysicalObject: true,
        historicalPinnedRead: 'after removal and restart',
        noFileDeletion: true,
      };
    }
  );
  await check(
    'MA-03',
    'Real owner deaths across file publication and SQL commit recover old-or-new roots',
    async () => {
      const phases = [
          'asset_before_stage',
          'asset_half_written',
          'asset_before_file_sync',
          'asset_after_file_sync',
          'asset_after_publish',
          'asset_before_dir_sync',
          'asset_after_dir_sync',
          'before_begin',
          'after_revision',
          'after_outcome',
          'before_commit',
          'after_commit',
          'before_reply',
        ],
        evidence = [];
      for (const phase of phases) {
        let o = await fresh();
        const dir = o.dir,
          c = importAsset();
        await o.control('fault', { phase, operationId: c.operationId });
        const pending = o.rpc(c);
        await o.next((m) => m.type === 'phase' && m.phase === phase);
        await o.stop();
        await pending;
        o = await start(dir);
        const root = await o.read(),
          committed = ['after_commit', 'before_reply'].includes(phase);
        assert.equal(root.version, committed ? 1 : 0);
        assert.equal(
          Object.keys(root.state.assetLinks).length,
          committed ? 1 : 0
        );
        const prior = applied(
          await o.rpc({ method: 'outcome', operationId: c.operationId })
        );
        assert.equal(prior !== null, committed);
        if (!committed) refused(await o.rpc(read(0)), 'ATTACHMENT_NOT_FOUND');
        const receipt = applied(await o.rpc(c));
        assert.equal(receipt.version, 1);
        if (prior) assert.deepEqual(receipt, prior);
        assert.deepEqual(applied(await o.rpc(c)), receipt);
        assert.equal((await o.read()).version, 1);
        assert.equal(
          applied(await o.rpc(read(1))).base64,
          png.toString('base64')
        );
        refused(
          await o.rpc({ ...c, name: 'changed.png' }),
          'OPERATION_ID_REUSED'
        );
        evidence.push({
          phase,
          recoveredVersion: root.version,
          retryVersion: receipt.version,
        });
      }
      return evidence;
    }
  );
  await check(
    'MA-04',
    'Publication/flush checkpoints precede SQL and failures never acknowledge a root',
    async () => {
      const details = [];
      for (const failure of [
        'asset_before_file_sync',
        'asset_before_dir_sync',
        'sql_save',
      ]) {
        const dir = freshDir(),
          store = new Store(dir, { init: true, model }),
          meta = store.getMeta(),
          c = {
            ...importAsset(),
            spaceId: meta.space_id,
            documentId: meta.document_id,
          };
        const trace = [];
        try {
          store.phase = async (name) => {
            trace.push(name);
            if (name === failure) throw Error('INJECTED_PUBLICATION_FAILURE');
          };
          store.failWrites = failure === 'sql_save';
          await assert.rejects(
            store.execute(c),
            failure === 'sql_save'
              ? /INJECTED_SAVE_FAILURE/
              : /INJECTED_PUBLICATION_FAILURE/
          );
          assert.equal(store.getMeta().current_version, 0);
          assert.equal(store.outcome(c.operationId), null);
          assert.deepEqual(store.root(0).state.assetLinks, {});
          store.failWrites = false;
          store.phase = async (name) => {
            trace.push(name);
          };
          trace.length = 0;
          assert.equal((await store.execute(c)).version, 1);
          assert.ok(
            trace.indexOf('asset_after_dir_sync') <
              trace.indexOf('before_begin')
          );
          assert.ok(
            trace.indexOf('after_commit') > trace.indexOf('before_commit')
          );
          store.check();
          details.push({ failure, retryVersion: 1, dirFlushBeforeSql: true });
        } finally {
          store.close();
        }
      }
      return {
        checkpoints: details,
        limit:
          'Injected exception BEFORE flush calls, not an OS fsync fault or power-loss test',
      };
    }
  );
  await check(
    'MA-05',
    'Failed SQL leaves complete orphan unreachable; restart never adopts it',
    async () => {
      let o = await fresh();
      const c = importAsset();
      await o.control('fail_writes', { value: true });
      refused(await o.rpc(c), 'INJECTED_SAVE_FAILURE');
      assert.ok(existsSync(objectPath(o)));
      assert.deepEqual((await o.read()).state.assets, {});
      refused(await o.rpc(read(0)), 'ATTACHMENT_NOT_FOUND');
      const dir = o.dir;
      await o.stop();
      o = await start(dir);
      assert.equal((await o.read()).version, 0);
      assert.ok(existsSync(objectPath(o)));
      assert.equal(applied(await o.rpc(c)).version, 1);
      return { orphanAdoption: false, retryVerifiedAndReused: true };
    }
  );
  await check(
    'MA-06',
    'Corrupt existing orphan is refused, never overwritten from import bytes',
    async () => {
      const o = await fresh();
      await o.control('fail_writes', { value: true });
      refused(await o.rpc(importAsset()), 'INJECTED_SAVE_FAILURE');
      const file = objectPath(o);
      chmodSync(file, 0o600);
      const corrupt = Buffer.from(png);
      corrupt[corrupt.length - 1] ^= 1;
      writeFileSync(file, corrupt);
      await o.control('fail_writes', { value: false });
      refused(await o.rpc(importAsset()), 'BROKEN_EXTERNAL_ASSET');
      assert.deepEqual(readFileSync(file), corrupt);
      assert.equal((await o.read()).version, 0);
      return { filenameNotTrusted: true, noReplacement: true };
    }
  );
  await check(
    'MA-07',
    'Missing truncated or corrupt pinned objects fail media reads and reopening',
    async () => {
      const evidence = [];
      for (const kind of ['missing', 'truncated', 'corrupt']) {
        const o = await fresh();
        applied(await o.rpc(importAsset()));
        applied(
          await o.rpc({
            method: 'pin_version',
            operationId: randomUUID(),
            version: 1,
          })
        );
        applied(await o.rpc(remove(1)));
        const file = objectPath(o);
        if (kind === 'missing') unlinkSync(file);
        else {
          chmodSync(file, 0o600);
          const bytes = Buffer.from(png);
          if (kind === 'corrupt') bytes[bytes.length - 1] ^= 1;
          writeFileSync(
            file,
            kind === 'truncated' ? bytes.subarray(0, 20) : bytes
          );
        }
        refused(await o.rpc(read(1)), 'BROKEN_EXTERNAL_ASSET');
        await o.stop();
        const r = await start(o.dir, { expectedError: true });
        assert.equal(r.error, 'BROKEN_EXTERNAL_ASSET');
        assert.equal(existsSync(file), kind !== 'missing');
        if (kind === 'truncated') assert.equal(readFileSync(file).length, 20);
        evidence.push({
          kind,
          read: 'refused',
          reopen: 'refused',
          autoRepair: false,
        });
      }
      return evidence;
    }
  );
  await check(
    'MA-08',
    'Symlink objects and directories cannot redirect file publication',
    async () => {
      for (const mode of ['object', 'directory']) {
        const o = await fresh(),
          outside = join(base, randomUUID());
        writeFileSync(outside, png);
        if (mode === 'object') {
          directories({ dir: o.dir }, { create: true });
          symlinkSync(outside, objectPath(o));
          refused(await o.rpc(importAsset()), 'BROKEN_EXTERNAL_ASSET');
        } else {
          const outsideDir = join(base, randomUUID());
          mkdirSync(outsideDir);
          symlinkSync(outsideDir, join(o.dir, 'media'));
          refused(await o.rpc(importAsset()), 'UNSAFE_ASSET_DIRECTORY');
          assert.deepEqual(readdirSync(outsideDir), []);
        }
        assert.equal((await o.read()).version, 0);
        assert.deepEqual(readFileSync(outside), png);
      }
      return {
        pathsFromHashOnly: true,
        noFollow: true,
        limit:
          'same-user private-store proof, not race-hardening/security acceptance',
      };
    }
  );
  await check(
    'MA-09',
    'Invalid bytes/type/cover/destination reject without publication',
    async () => {
      const o = await fresh(),
        cases = [
          [importAsset(0, { bytes: Buffer.from('not a png') }), 'INVALID_PNG'],
          [importAsset(0, { bytes: pdf }), 'INVALID_PNG'],
          [
            importAsset(0, {
              bytes: Buffer.from('%PDF-1.4\nnot a document'),
              mime: 'application/pdf',
            }),
            'UNSUPPORTED_OR_INVALID_PDF',
          ],
          [
            importAsset(0, {
              role: 'cover',
              bytes: pdf,
              mime: 'application/pdf',
            }),
            'INVALID_COVER',
          ],
          [importAsset(0, { pageId: 'missing' }), 'PAGE_NOT_FOUND'],
          [{ ...importAsset(), base64: '!' }, 'INVALID_ASSET_BASE64'],
          [importAsset(0, { bytes: Buffer.alloc(262145) }), 'ASSET_BYTE_LIMIT'],
        ];
      for (const [c, error] of cases) refused(await o.rpc(c), error);
      assert.equal((await o.read()).version, 0);
      assert.equal(existsSync(join(o.dir, 'media')), false);
      const c = { ...importAsset(), name: '../../display-name.png' };
      applied(await o.rpc(c));
      assert.ok(existsSync(objectPath(o)));
      assert.deepEqual(readdirSync(join(o.dir, 'media', 'objects')), [
        hash(png),
      ]);
      return {
        admissionFailures: cases.length,
        displayNameNeverUsedAsPath: true,
        pdfCheck: 'bounded structural subset only',
      };
    }
  );
  await check(
    'MA-10',
    'RPC CLI and MCP share one external import receipt and historical bytes',
    async () => {
      const o = await fresh(),
        adapter = await mcp(o, { entry: 'media/mcp.mjs' });
      try {
        const tools = await adapter.request('tools/list', {});
        assert.ok(JSON.stringify(tools.result).includes('import_asset'));
        const c = importAsset(),
          receipt = applied(await cli(o, c));
        assert.deepEqual(applied(await o.rpc(c)), receipt);
        assert.deepEqual(applied(await adapter.command(c)), receipt);
        const value = applied(await adapter.command(read(1)));
        assert.equal(value.base64, png.toString('base64'));
        assert.equal(value.hash, hash(png));
        assert.equal((await o.read()).version, 1);
        return { sharedCore: true, sameReceipt: true };
      } finally {
        await adapter.stop();
      }
    }
  );
  await check(
    'MA-11',
    'SQL holds one Y root with metadata/links, not media byte copies',
    async () => {
      const o = await fresh();
      applied(await o.rpc(importAsset()));
      applied(
        await o.rpc(
          importAsset(1, {
            bytes: pdf,
            mime: 'application/pdf',
            attachmentId: 'pdf',
          })
        )
      );
      await o.stop();
      const db = new DatabaseSync(join(o.dir, 'vault.sqlite'), {
        readOnly: true,
      });
      try {
        assert.equal(db.prepare('SELECT count(*) AS n FROM blobs').get().n, 0);
        for (const r of db
          .prepare('SELECT state,typeof(state) AS type FROM revisions')
          .all()) {
          assert.equal(r.type, 'blob');
          const s = model.decode(r.state);
          model.validateState(s);
          assert.equal(Buffer.from(s.payload, 'base64').includes(png), false);
          assert.equal(Buffer.from(s.payload, 'base64').includes(pdf), false);
        }
      } finally {
        db.close();
      }
      const reopened = await start(o.dir);
      assert.equal((await reopened.read()).version, 2);
      return { sqlMediaBlobs: 0, canonicalObjectFiles: 2 };
    }
  );
  await check(
    'MA-12',
    'Entity operations preserve media manifest; wrong model refuses writable open',
    async () => {
      const o = await fresh();
      applied(await o.rpc(importAsset(0, { pageId: 't1', role: 'cover' })));
      const before = await o.read();
      applied(
        await o.rpc({
          method: 'edit_task',
          operationId: randomUUID(),
          expectedVersion: 1,
          taskId: 't1',
          title: 'Updated task',
          body: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                attrs: { blockId: 't1-p1' },
                content: [{ type: 'text', text: 'New body' }],
              },
            ],
          },
          properties: {},
        })
      );
      const after = await o.read();
      assert.deepEqual(after.state.assetLinks, before.state.assetLinks);
      assert.deepEqual(after.state.assets, before.state.assets);
      await o.stop();
      const old = await start(o.dir, {
        entry: 'entities/owner.mjs',
        expectedError: true,
      });
      assert.equal(old.error, 'UNMARKED_STORE');
      return {
        taskPageBodyAndCover: 'same page identity',
        oldProfile: 'refused',
      };
    }
  );
} catch (e) {
  process.exitCode = 1;
  console.error(e.stack);
} finally {
  for (const o of owners) await o.stop();
  mkdirSync('artifacts', { recursive: true });
  const output = process.env.MEDIA_RESULT ?? 'artifacts/media-results.json';
  writeFileSync(
    output,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        gate: 'JG-13',
        scope:
          'Bounded external inert-byte publication/retained-root proof, no native media renderer or power-loss acceptance',
        profile,
        contractSha256: hash(readFileSync('media/CONTRACT.md')),
        fixtures: {
          png: { hash: hash(png), bytes: png.length },
          pdf: { hash: hash(pdf), bytes: pdf.length },
        },
        results,
      },
      null,
      2
    ) + '\n'
  );
  console.log('Report', output);
}
