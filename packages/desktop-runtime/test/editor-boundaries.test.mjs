import { pageContent } from '../../editor/src/schema.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { qualifiedEngine } from '@clutter/editor/backend';
import { browserCodec } from '../../editor/src/browser-codec.mjs';
import { toBase64 } from '../../core/src/contracts.ts';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../editor');
const content = {
  content: pageContent('Shared', 'Alpha beta'),
  properties: {},
};
test('public browser entry bundles with no backend/OS/experiment imports and a single Yjs instance', async () => {
  const out = await build({
    entryPoints: [join(root, 'src/browser.mjs')],
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
      assert.equal(codec.projection(doc, 'notes').title, 'Shared');
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
      entryPoints: [join(root, 'src/backend.mjs')],
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
                .content
            )
          ),
          projection.content.value
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
