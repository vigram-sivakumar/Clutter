import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
  writeFileSync,
  chmodSync,
  readdirSync,
  rmSync,
  unlinkSync,
  symlinkSync,
  renameSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import {
  SpaceService,
  CoreClient,
  toBase64,
  fromBase64,
} from '../src/index.ts';
import { SqliteVault } from '../src/adapters/sqlite-vault.ts';
import { hash, crc32 } from '../src/adapters/media-formats.mjs';
import { qualifiedEngine } from '../../../docs/foundation/i1/qualified-engine.mjs';
const png = readFileSync(
  new URL(
    '../../../docs/foundation/experiments/r07-two-view/media/fixtures/tiny.png',
    import.meta.url
  )
);
const pdf = readFileSync(
  new URL(
    '../../../docs/foundation/experiments/r07-two-view/media/fixtures/tiny.pdf',
    import.meta.url
  )
);
function otherPng() {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]),
      n = Buffer.alloc(4),
      crc = Buffer.alloc(4);
    n.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([n, body, crc]);
  };
  const ihdr = Buffer.from('00000001000000010806000000', 'hex');
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const alt = otherPng();
const ok = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.value;
};
const code = (r, c) => {
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(r.error.code, c);
};
function setup(t, hooks = {}) {
  const v = SqliteVault.createDisposable(hooks);
  let n = 0;
  const x = {
    v,
    s: new SpaceService(v, qualifiedEngine, { newGrant: () => `grant-${++n}` }),
    next: () => `op-${++n}`,
  };
  x.principal = {
    spaceId: v.spaceId,
    peerId: 'desktop',
    scopes: ['read', 'write'],
  };
  x.run = (c) => x.s.execute(c, x.principal);
  x.client = new CoreClient(x.run);
  x.create = async (pageId = 'p', kind = 'note') =>
    ok(
      await x.run({
        apiVersion: 1,
        spaceId: v.spaceId,
        pageId,
        method: 'page.create',
        operationId: x.next(),
        kind,
        title: pageId,
        body: {
          format: 'clutter.i1.pm-json',
          schemaVersion: 1,
          value: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                attrs: { blockId: pageId + '-body' },
                content: [{ type: 'text', text: 'Body' }],
              },
            ],
          },
        },
        properties: {},
      })
    );
  x.command = (extra = {}) => ({
    apiVersion: 1,
    spaceId: v.spaceId,
    pageId: 'p',
    method: 'media.import',
    operationId: x.next(),
    expectedHead: x.v.load('p').head,
    attachmentId: 'image',
    name: 'image.png',
    mime: 'image/png',
    role: 'body',
    payload: toBase64(png),
    ...extra,
  });
  x.list = async (pageId = 'p', atSequence) =>
    ok(
      await x.client.execute({
        apiVersion: 1,
        spaceId: v.spaceId,
        pageId,
        method: 'media.list',
        ...(atSequence === undefined ? {} : { atSequence }),
      })
    );
  x.read = async (attachmentId = 'image', pageId = 'p', atSequence) =>
    ok(
      await x.client.execute({
        apiVersion: 1,
        spaceId: v.spaceId,
        pageId,
        method: 'media.read',
        attachmentId,
        ...(atSequence === undefined ? {} : { atSequence }),
      })
    );
  x.restart = () => {
    x.v.close();
    x.v = SqliteVault.reopenDisposable(v.directory, hooks);
    x.s = new SpaceService(x.v, qualifiedEngine, {
      newGrant: () => `grant-${++n}`,
    });
  };
  t.after(() => {
    try {
      x.v.close();
    } catch {}
    rmSync(v.directory, { recursive: true, force: true });
  });
  return x;
}
async function seeded(t, hooks) {
  const x = setup(t, hooks);
  await x.create();
  return x;
}
const objects = (x) => readdirSync(join(x.v.directory, 'media/objects'));
function replace(x, payload = toBase64(alt), extra = {}) {
  const c = x.command({ method: 'media.replace', payload, ...extra });
  delete c.role;
  return c;
}
function remove(x, attachmentId = 'image') {
  const c = x.command({ method: 'media.remove', attachmentId });
  for (const key of ['role', 'mime', 'name', 'payload']) delete c[key];
  return c;
}

test('PNG/PDF associations use the same page operations for notes and full task pages', async (t) => {
  const x = await seeded(t);
  await x.create('task', 'task');
  ok(await x.client.execute(x.command()));
  ok(
    await x.run(
      x.command({
        pageId: 'task',
        expectedHead: x.v.load('task').head,
        attachmentId: 'task-pdf',
        mime: 'application/pdf',
        name: 'notes.pdf',
        payload: toBase64(pdf),
      })
    )
  );
  ok(
    await x.run(
      x.command({
        pageId: 'task',
        expectedHead: x.v.load('task').head,
        attachmentId: 'task-cover',
        role: 'cover',
      })
    )
  );
  assert.equal((await x.list('task')).assets['task-cover'].role, 'cover');
  assert.deepEqual(Buffer.from(fromBase64((await x.read()).payload)), png);
  assert.equal((await x.list()).assets.image.mime, 'image/png');
  assert.equal((await x.read('task-pdf', 'task')).mime, 'application/pdf');
  assert.equal(objects(x).length, 2);
});
test('cover replacement is atomic; old immutable bytes and names remain historically readable', async (t) => {
  const x = await seeded(t);
  const original = ok(await x.run(x.command({ role: 'cover' })));
  code(
    await x.run(x.command({ attachmentId: 'second', role: 'cover' })),
    'COVER_EXISTS'
  );
  assert.equal(objects(x).length, 1);
  const changed = ok(
    await x.run(replace(x, toBase64(alt), { name: 'new.png' }))
  );
  assert.notEqual(original.head, changed.head);
  assert.equal((await x.list()).assets.image.role, 'cover');
  assert.deepEqual(Buffer.from(fromBase64((await x.read()).payload)), alt);
  assert.deepEqual(
    Buffer.from(
      fromBase64((await x.read('image', 'p', original.sequence)).payload)
    ),
    png
  );
  assert.equal(
    (await x.list('p', original.sequence)).assets.image.name,
    'image.png'
  );
  code(
    await x.run(replace(x, toBase64(pdf), { mime: 'application/pdf' })),
    'INVALID_COVER'
  );
  x.restart();
  assert.deepEqual(
    Buffer.from(
      fromBase64((await x.read('image', 'p', original.sequence)).payload)
    ),
    png
  );
});
test('remove detaches only current links; history and bytes survive restart', async (t) => {
  const x = await seeded(t),
    receipt = ok(await x.run(x.command()));
  ok(await x.run(remove(x)));
  assert.deepEqual((await x.list()).assets, {});
  code(
    await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      attachmentId: 'image',
      method: 'media.read',
    }),
    'ATTACHMENT_NOT_FOUND'
  );
  assert.equal(objects(x).length, 1);
  x.restart();
  assert.deepEqual(
    Buffer.from(
      fromBase64((await x.read('image', 'p', receipt.sequence)).payload)
    ),
    png
  );
});
test('admission and stale heads refuse before publishing any object', async (t) => {
  let phases = 0;
  const x = await seeded(t, {
    assetPhase: () => {
      phases++;
    },
  });
  code(await x.run(x.command({ expectedHead: '0'.repeat(64) })), 'CONFLICT');
  code(
    await x.run(
      x.command({
        role: 'cover',
        mime: 'application/pdf',
        payload: toBase64(pdf),
      })
    ),
    'INVALID_COVER'
  );
  code(await x.run(x.command({ pageId: 'missing' })), 'NOT_FOUND');
  assert.equal(phases, 0);
  assert.equal(objects(x).length, 0);
  ok(await x.run(x.command()));
  await x.create('other');
  const before = phases;
  code(
    await x.run(
      x.command({ pageId: 'other', expectedHead: x.v.load('other').head })
    ),
    'DUPLICATE_ATTACHMENT'
  );
  assert.equal(phases, before);
});
test('invalid bytes, MIME and oversized objects never create a reference', async (t) => {
  const x = await seeded(t);
  for (const c of [
    x.command({ payload: toBase64(pdf) }),
    x.command({ payload: toBase64(png.subarray(0, 20)) }),
    x.command({ payload: toBase64(Buffer.from('%PDF-1.4\n/JavaScript')) }),
    x.command({ payload: toBase64(Buffer.alloc(262145)) }),
    x.command({ mime: 'image/jpeg' }),
  ])
    assert.equal((await x.run(c)).ok, false);
  assert.deepEqual((await x.list()).assets, {});
  assert.equal(objects(x).length, 0);
});
test('SQL failure leaves an unreachable object; exact retry commits only once', async (t) => {
  let fail = true;
  const x = await seeded(t, {
      beforeCommit: (c) => {
        if (fail && c.method === 'media.import') throw Error('failed commit');
      },
    }),
    c = x.command();
  code(await x.run(c), 'INTERNAL_ERROR');
  assert.equal(objects(x).length, 1);
  assert.deepEqual((await x.list()).assets, {});
  fail = false;
  const a = ok(await x.run(c));
  assert.deepEqual(ok(await x.client.execute(c)), a);
  assert.equal(a.sequence, 2);
  assert.equal(objects(x).length, 1);
});
test('unknown import reply survives service restart and replays its exact receipt', async (t) => {
  let lose = true;
  const x = await seeded(t, {
      afterCommit: (c) => {
        if (lose && c.method === 'media.import') {
          lose = false;
          throw Error('lost commit reply');
        }
      },
    }),
    c = x.command();
  code(await x.run(c), 'OUTCOME_UNKNOWN');
  x.restart();
  const a = ok(await x.run(c));
  assert.equal(a.sequence, 2);
  assert.deepEqual(ok(await x.run(c)), a);
  assert.equal(objects(x).length, 1);
  code(await x.run({ ...c, name: 'different.png' }), 'OPERATION_ID_REUSED');
});
test('identical bytes deduplicate across page associations without sharing attachment identity', async (t) => {
  const x = await seeded(t);
  await x.create('task', 'task');
  ok(await x.run(x.command()));
  ok(
    await x.run(
      x.command({
        pageId: 'task',
        expectedHead: x.v.load('task').head,
        attachmentId: 'other',
      })
    )
  );
  assert.equal(objects(x).length, 1);
  assert.equal((await x.read('other', 'task')).hash, (await x.read()).hash);
  ok(await x.run(remove(x)));
  assert.equal((await x.read('other', 'task')).mime, 'image/png');
});
test('full-body/metadata edits preserve associations and history closure', async (t) => {
  const x = await seeded(t),
    receipt = ok(await x.run(x.command()));
  ok(
    await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      method: 'page.update',
      operationId: 'edit',
      expectedHead: x.v.load('p').head,
      patch: { title: 'Renamed' },
    })
  );
  assert.equal((await x.list()).assets.image.hash, hash(png));
  x.restart();
  assert.equal((await x.read('image', 'p', receipt.sequence)).hash, hash(png));
});
test('missing, truncated and symlink objects refuse reads and reopening', async (t) => {
  for (const mode of ['missing', 'truncated', 'symlink']) {
    const x = await seeded(t);
    ok(await x.run(x.command()));
    const path = join(x.v.directory, 'media/objects', hash(png));
    if (mode === 'missing') unlinkSync(path);
    else if (mode === 'truncated') {
      chmodSync(path, 0o600);
      writeFileSync(path, png.subarray(0, 12));
    } else {
      unlinkSync(path);
      const outside = join(x.v.directory, 'outside');
      writeFileSync(outside, png);
      symlinkSync(outside, path);
    }
    assert.equal(
      (
        await x.run({
          apiVersion: 1,
          spaceId: x.v.spaceId,
          pageId: 'p',
          method: 'media.read',
          attachmentId: 'image',
        })
      ).ok,
      false
    );
    x.v.close();
    assert.throws(() => SqliteVault.reopenDisposable(x.v.directory));
  }
});
test('symlink directories and existing object collisions fail without redirecting writes', async (t) => {
  const x = await seeded(t),
    outside = join(x.v.directory, 'elsewhere');
  renameSync(join(x.v.directory, 'media/objects'), outside);
  symlinkSync(outside, join(x.v.directory, 'media/objects'));
  assert.equal((await x.run(x.command())).ok, false);
  assert.equal(readdirSync(outside).length, 0);
});
test('derived root references are audited against the canonical Y links', async (t) => {
  const x = await seeded(t);
  ok(await x.run(x.command()));
  x.v.close();
  const db = new DatabaseSync(join(x.v.directory, 'space.sqlite'));
  db.prepare('UPDATE asset_refs SET name=?').run('wrong.png');
  db.close();
  x.v = SqliteVault.reopenDisposable(x.v.directory);
  assert.throws(
    () => new SpaceService(x.v, qualifiedEngine),
    /BROKEN_ASSET_INDEX/
  );
});
test('read-only principals may read media but cannot publish or replace it', async (t) => {
  const x = await seeded(t);
  ok(await x.run(x.command()));
  const principal = { spaceId: x.v.spaceId, scopes: ['read'] };
  code(await x.s.execute(replace(x), principal), 'FORBIDDEN');
  ok(
    await x.s.execute(
      {
        apiVersion: 1,
        spaceId: x.v.spaceId,
        pageId: 'p',
        attachmentId: 'image',
        method: 'media.read',
      },
      principal
    )
  );
});

test('publication and SQL crash boundaries retain old-or-new closure and exact retries', async (t) => {
  for (const phase of [
    'asset_before_stage',
    'asset_half_written',
    'asset_before_file_sync',
    'asset_after_file_sync',
    'asset_after_publish',
    'asset_before_dir_sync',
    'asset_after_dir_sync',
    'sql_before_commit',
    'sql_after_commit',
  ]) {
    const x = await seeded(t),
      c = x.command();
    x.v.close();
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('./media-crash-worker.mjs', import.meta.url)),
        x.v.directory,
        phase,
        JSON.stringify(c),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let err = '';
    child.stderr.on('data', (v) => (err += v));
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
    timer.unref();
    const [exit, signal] = await once(child, 'exit');
    clearTimeout(timer);
    assert.equal(signal, 'SIGKILL', phase + ': ' + exit + err);
    x.v = SqliteVault.reopenDisposable(x.v.directory);
    x.s = new SpaceService(x.v, qualifiedEngine);
    const before = await x.list();
    assert.equal(
      Object.hasOwn(before.assets, 'image'),
      phase === 'sql_after_commit',
      phase
    );
    const receipt = ok(await x.run(c));
    assert.equal(receipt.sequence, 2, phase);
    assert.deepEqual(ok(await x.client.execute(c)), receipt);
    assert.deepEqual(
      Buffer.from(fromBase64((await x.read()).payload)),
      png,
      phase
    );
  }
});
test('replacement crash before/after SQL commit preserves both old and new historical bytes', async (t) => {
  for (const phase of ['sql_before_commit', 'sql_after_commit']) {
    const x = await seeded(t),
      first = ok(await x.run(x.command())),
      c = replace(x);
    x.v.close();
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('./media-crash-worker.mjs', import.meta.url)),
        x.v.directory,
        phase,
        JSON.stringify(c),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let err = '';
    child.stderr.on('data', (v) => (err += v));
    const [exit, signal] = await once(child, 'exit');
    assert.equal(signal, 'SIGKILL', String(exit) + err);
    x.v = SqliteVault.reopenDisposable(x.v.directory);
    x.s = new SpaceService(x.v, qualifiedEngine);
    assert.equal(
      (await x.read()).hash,
      hash(phase === 'sql_after_commit' ? alt : png)
    );
    ok(await x.run(c));
    assert.equal((await x.read()).hash, hash(alt));
    assert.equal((await x.read('image', 'p', first.sequence)).hash, hash(png));
  }
});
test('SQL stores references and object metadata, never a second media byte copy', async (t) => {
  const x = await seeded(t);
  ok(await x.run(x.command()));
  x.v.close();
  const db = new DatabaseSync(join(x.v.directory, 'space.sqlite'));
  t.after(() => db.close());
  const columns = db
    .prepare('PRAGMA table_info(asset_objects)')
    .all()
    .map((r) => r.name);
  assert.deepEqual(columns, ['hash', 'mime', 'bytes']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM asset_refs').get().n, 1);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM asset_objects').get().n,
    1
  );
});
test('older disposable media-less schemas are refused without migration', async (t) => {
  for (const version of [1, 2]) {
    const x = await seeded(t);
    x.v.close();
    const file = join(x.v.directory, 'space.sqlite'),
      db = new DatabaseSync(file);
    db.exec(`PRAGMA user_version=${version}`);
    db.close();
    const before = readFileSync(file);
    assert.throws(
      () => SqliteVault.reopenDisposable(x.v.directory),
      /UNSUPPORTED_STORE/
    );
    assert.deepEqual(readFileSync(file), before);
  }
});
