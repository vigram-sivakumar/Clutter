import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { qualifiedEngine } from '@clutter/foundation-runtime/editor/backend';
import { browserCodec } from '../src/editor/browser-codec.mjs';
import { toBase64 } from '../src/contracts.ts';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const content = {
  title: 'Shared',
  properties: {},
  body: {
    format: 'clutter.i1.pm-json',
    schemaVersion: 1,
    value: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'block' },
          content: [{ type: 'text', text: 'Alpha beta' }],
        },
      ],
    },
  },
};
test('public browser entry bundles with no backend/OS/experiment imports and a single Yjs instance', async () => {
  const out = await build({
    entryPoints: [join(root, 'src/editor/browser.mjs')],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'ClutterSharedEditor',
    target: 'safari17',
    metafile: true,
  });
  const inputs = Object.keys(out.metafile.inputs);
  for (const input of inputs)
    assert.doesNotMatch(
      input,
      /docs\/foundation|editor\/(engine|backend|page-codec|page-model|qualified-replica)\.mjs|sqlite|media-files|media-formats/
    );
  assert.equal(inputs.filter((p) => /yjs\/dist\/yjs\.mjs$/.test(p)).length, 1);
  for (const input of Object.values(out.metafile.inputs))
    for (const imported of input.imports)
      assert.doesNotMatch(imported.path, /^node:/);
  const browser = new JSDOM('<!doctype html><body></body>', {
    runScripts: 'outside-only',
  });
  try {
    browser.window.TextEncoder = TextEncoder;
    browser.window.TextDecoder = TextDecoder;
    assert.equal(browser.window.Buffer, undefined);
    assert.equal(browser.window.process, undefined);
    browser.window.eval(
      out.outputFiles[0].text +
        '\n;globalThis.ClutterSharedEditor = ClutterSharedEditor;'
    );
    assert.equal(
      typeof browser.window.ClutterSharedEditor.createEditorReplica,
      'function'
    );
    const accepted = qualifiedEngine.create('page', 'note', content);
    const codec = browser.window.ClutterSharedEditor.browserCodec;
    const doc = codec.read({ ...accepted, payload: toBase64(accepted.bytes) });
    try {
      assert.equal(codec.projection(doc, 'notes').title, content.title);
    } finally {
      doc.destroy();
    }
  } finally {
    browser.window.close();
  }
});
test('backend builds independently of docs and its accepted root matches browser projection for notes and task pages', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'clutter-shared-editor-'));
  try {
    const outfile = join(dir, 'backend.mjs');
    const result = await build({
      entryPoints: [join(root, 'src/editor/backend.mjs')],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node24',
      metafile: true,
    });
    for (const input of Object.keys(result.metafile.inputs))
      assert.doesNotMatch(
        input,
        /docs\/foundation|src\/editor\/replica\.mjs|sqlite-vault/
      );
    const command = `
      import { qualifiedEngine } from ${JSON.stringify(pathToFileURL(outfile).href)};
      const rows = ['note','task'].map(kind => {
        const accepted=qualifiedEngine.create('page',kind,${JSON.stringify(content)});
        const corrupt={...accepted,bytes:Buffer.from(accepted.bytes)};
        corrupt.bytes[corrupt.bytes.length-1]^=1;
        let rejected=false;
        try { qualifiedEngine.project(corrupt); } catch { rejected=true; }
        return {kind,checkout:{...accepted,payload:Buffer.from(accepted.bytes).toString('base64')},projection:qualifiedEngine.project(accepted),rejected};
      });
      console.log(JSON.stringify(rows));`;
    const rows = JSON.parse(
      execFileSync(
        process.execPath,
        ['--input-type=module', '--eval', command],
        { encoding: 'utf8' }
      )
    );
    for (const { kind, checkout, projection, rejected } of rows) {
      const doc = browserCodec.read(checkout);
      try {
        assert.deepEqual(
          JSON.parse(
            JSON.stringify(
              browserCodec.projection(doc, kind === 'note' ? 'notes' : 'tasks')
                .body
            )
          ),
          projection.body.value
        );
      } finally {
        doc.destroy();
      }
      assert.deepEqual(
        JSON.parse(JSON.stringify(projection)),
        JSON.parse(
          JSON.stringify(
            qualifiedEngine.project({
              pageId: checkout.pageId,
              kind: checkout.kind,
              head: checkout.head,
              bytes: Buffer.from(checkout.payload, 'base64'),
            })
          )
        )
      );
      assert.equal(rejected, true);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('I1 qualified composition paths resolve to the same canonical engine, replica and codecs', async () => {
  const [
    oldEngine,
    oldReplica,
    oldCodec,
    oldQualified,
    engine,
    replica,
    codec,
    qualified,
  ] = await Promise.all([
    import('../../../docs/foundation/i1/qualified-engine.mjs'),
    import('../../../docs/foundation/i1/editor-replica.mjs'),
    import('../../../docs/foundation/i1/native/browser-codec.mjs'),
    import('../../../docs/foundation/i1/qualified-editor.mjs'),
    import('../src/editor/engine.mjs'),
    import('../src/editor/replica.mjs'),
    import('../src/editor/browser-codec.mjs'),
    import('../src/editor/qualified-replica.mjs'),
  ]);
  assert.equal(oldEngine.qualifiedEngine, engine.qualifiedEngine);
  assert.equal(oldReplica.createEditorReplica, replica.createEditorReplica);
  assert.equal(oldCodec.browserCodec, codec.browserCodec);
  assert.equal(
    oldQualified.createQualifiedReplica,
    qualified.createQualifiedReplica
  );
});
test('declared editor dependency pins retain the qualified versions and root lock integrity', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json')));
  const lock = JSON.parse(
    readFileSync(join(root, '../../package-lock.json'))
  ).packages;
  const old = JSON.parse(
    readFileSync(
      join(
        root,
        '../../docs/foundation/experiments/r07-two-view/package-lock.json'
      )
    )
  ).packages;
  assert.deepEqual(
    lock['packages/foundation-runtime'].dependencies,
    pkg.dependencies
  );
  for (const [name, version] of Object.entries(pkg.dependencies)) {
    assert.equal(lock['node_modules/' + name].version, version);
    assert.equal(
      lock['node_modules/' + name].integrity,
      old['node_modules/' + name].integrity
    );
  }
});
