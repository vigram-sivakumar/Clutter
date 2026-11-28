import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** The root router and engine projection own disjoint paste targets. */
const EDITOR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Code only: comments are free to name a handler. */
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** A `paste` key of a DOM event handler map: `paste(event…) {` or `paste: …`. */
const PASTE_HANDLER = /\bpaste\s*(?:\(\s*(?:event|e|_event)\b[^)]*\)\s*\{|:\s*(?:\(|function|async))/;

describe('paste handler ownership', () => {
  const files = sourceFiles(EDITOR).map((path) => ({ path: relative(EDITOR, path), code: strip(readFileSync(path, 'utf8')) }));

  it('only pasteRouting.ts registers a paste handler for the clipboard', () => {
    const owners = files.filter((file) => PASTE_HANDLER.test(file.code)).map((file) => file.path);

    expect(owners).toEqual(['codemirror/paste/pasteRouting.ts']);
  });

  it('the root router registers exactly one paste handler and the projection owns cell clipboard events', () => {
    const router = files.find((file) => file.path === 'codemirror/paste/pasteRouting.ts')!;

    expect(router.code.match(new RegExp(PASTE_HANDLER.source, 'g'))).toHaveLength(1);
    const projection = files.find(file => file.path === 'codemirror/table-engine/tableProjection.ts')!.code;
    expect(projection).toContain("root.addEventListener('paste', clipboard, true)");
    expect(router.code).not.toContain('cellPasteRouting');
  });

  it('the editor extensions install the router once, and none of the retired handlers', () => {
    const build = files.find((file) => file.path === 'codemirror/buildEditorExtensions.ts')!.code;

    expect(build.match(/pasteRouting\(/g)).toHaveLength(1);
    for (const retired of ['tableCreatePaste(', 'tablePaste(', 'tableCellPaste(', 'pasteAssets(', 'reportSkippedFiles(', 'ignoreEmptyPaste(']) {
      expect(build).not.toContain(retired);
    }
  });

  it('classification is the only place that reads the clipboard to choose a strategy: strategies take what it classified', () => {
    for (const path of ['codemirror/table-engine/tableCreatePaste.ts', 'codemirror/paste/assetPaste.ts']) {
      const code = files.find((file) => file.path === path)!.code;

      expect(code).not.toMatch(/readClipboard(?:Table|Grid)\(/);
      expect(code).not.toMatch(/hasRichHtml\(\s*data/);
    }
    const assets = files.find((file) => file.path === 'codemirror/paste/assetPaste.ts')!.code;
    expect(assets).not.toMatch(/\b(?:DataTransfer|SUPPORTED_TYPE|hasRichHtml)\b/);
    expect(assets).not.toMatch(/\.getData\(/);
  });
});
