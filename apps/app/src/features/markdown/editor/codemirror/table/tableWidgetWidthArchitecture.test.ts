// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableWidgetDecoration } from './tableWidgetField';

/**
 * Regression coverage for the wrapper→scroll-viewport→table width
 * architecture (`tableWidget.css`'s own "three-layer" doc comments) — the
 * Notion-style model where the outer wrapper/scroll viewport stay pinned
 * to the editor's own content width while the actual `<table>` is free to
 * become wider (its own `<colgroup>`-derived intrinsic width) and scroll
 * horizontally inside that fixed viewport.
 *
 * jsdom does not apply real stylesheets or compute real layout/cascade
 * (`vite.config.ts`'s own `test.css` is unset, its documented default) —
 * every existing table test in this codebase already works within that
 * constraint by asserting DOM structure/classes (the *inputs* the real
 * cascade reacts to), never computed styles. This file adds one more
 * layer specifically because the bug this architecture fixes *was* a pure
 * CSS cascade-ordering mistake (two selectors of equal specificity, the
 * wrong one declared last) — invisible to any DOM-structure assertion,
 * since the DOM/class outputs were already correct before the fix; only
 * the stylesheet's own rule order was wrong. Reading the raw CSS source
 * and asserting on its structure directly is the only way, in this test
 * environment, to actually guard against that exact class of regression
 * recurring. The real, pixel-accurate behavior (wrapper stays capped,
 * table renders at its own intrinsic width, horizontal scroll reaches the
 * table's own right edge) was verified live in a real browser before this
 * fix shipped — see the accompanying report for that reproduction; it is
 * not, and cannot be, re-verified by this file.
 */

const CSS_PATH = join(__dirname, 'tableWidget.css');

/** Comments stripped — this file's own doc comments (this test file's own subject) deliberately quote real declarations as prose (e.g. "why `overflow-x: auto` stays conditional"), which would otherwise produce false-positive substring matches against the very assertions checking for those declarations' *real* presence/absence. */
function readCss(): string {
  return readFileSync(CSS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The index of `selector`'s own rule block start (`selector {`) in `css`, ignoring comments — `-1` if not found. Good enough for this file's own "which comes first" ordering checks; doesn't need a real CSS parser for a handful of known, simple selectors. */
function ruleIndex(css: string, selector: string): number {
  return css.indexOf(`${selector} {`);
}

describe('tableWidget.css — width architecture source', () => {
  const css = readCss();

  it('the outer wrapper is capped to 100%/max-width 100% (layer 1)', () => {
    const wrapperRule = css.slice(ruleIndex(css, '.cm-editor .cm-table-wrapper'), ruleIndex(css, '.cm-editor .cm-table-scroll'));
    expect(wrapperRule).toContain('width: 100%');
    expect(wrapperRule).toContain('max-width: 100%');
  });

  it('the scroll viewport is capped to 100%/max-width 100% (layer 2)', () => {
    const scrollRuleStart = ruleIndex(css, '.cm-editor .cm-table-scroll');
    const scrollRule = css.slice(scrollRuleStart, css.indexOf('}', scrollRuleStart));
    expect(scrollRule).toContain('width: 100%');
    expect(scrollRule).toContain('max-width: 100%');
  });

  it('the base table rule sets width: 100% (default, no-metadata behavior)', () => {
    // The `width: 100%` declaration lives in the combined
    // `.cm-table-wrapper table, .cm-table-wrapper .cm-line` selector, a
    // separate rule block from the `border`/`table-layout` one right
    // after it — both target `table`, so this checks the actual
    // combined-selector rule rather than assuming a single rule owns
    // every `table`-targeting declaration.
    const combinedIndex = css.indexOf('.cm-editor .cm-table-wrapper table,');
    expect(combinedIndex).toBeGreaterThan(-1);
    const combinedRule = css.slice(combinedIndex, css.indexOf('}', combinedIndex));
    expect(combinedRule).toContain('width: 100%');

    const baseTableIndex = ruleIndex(css, '.cm-editor .cm-table-wrapper table');
    expect(baseTableIndex).toBeGreaterThan(-1);
    expect(baseTableIndex).toBeGreaterThan(combinedIndex); // the border/table-layout rule comes after the width:100% one
  });

  it('the explicit-widths override table rule uses max-content, not auto or 100%', () => {
    const overrideIndex = ruleIndex(css, '.cm-editor .cm-table-wrapper--explicit-widths table');
    expect(overrideIndex).toBeGreaterThan(-1);
    const overrideRule = css.slice(overrideIndex, css.indexOf('}', overrideIndex));
    expect(overrideRule).toContain('width: max-content');
    expect(overrideRule).not.toContain('width: 100%');
    expect(overrideRule).not.toContain('width: auto');
  });

  it('CASCADE ORDER: the explicit-widths table override is declared AFTER the base width:100% table rule (the actual bug this file guards against)', () => {
    // Both selectors have identical specificity (`.cm-editor` + one class +
    // `table` element) — with no `!important` anywhere, the LATER rule in
    // source order wins a tie. The override was once declared *before* the
    // base rule, which the base rule then silently won every time,
    // permanently forcing every explicit-width table back to 100% from the
    // moment the resize feature shipped. This assertion is the actual
    // regression guard: it fails immediately if that ordering mistake is
    // ever reintroduced, regardless of what either rule's own body says.
    const baseIndex = ruleIndex(css, '.cm-editor .cm-table-wrapper table');
    const overrideIndex = ruleIndex(css, '.cm-editor .cm-table-wrapper--explicit-widths table');
    expect(baseIndex).toBeGreaterThan(-1);
    expect(overrideIndex).toBeGreaterThan(-1);
    expect(overrideIndex).toBeGreaterThan(baseIndex);
  });

  it('.cm-table-widget is overflow: visible — the CM6 block-widget layer must never become a clipping boundary', () => {
    const widgetRuleStart = ruleIndex(css, '.cm-editor .cm-table-widget');
    expect(widgetRuleStart).toBeGreaterThan(-1);
    const widgetRule = css.slice(widgetRuleStart, css.indexOf('}', widgetRuleStart));
    expect(widgetRule).toContain('overflow: visible');
  });

  it('.cm-table-wrapper is overflow: visible unconditionally — not a clipping layer either', () => {
    const wrapperRuleStart = ruleIndex(css, '.cm-editor .cm-table-wrapper');
    expect(wrapperRuleStart).toBeGreaterThan(-1);
    const wrapperRule = css.slice(wrapperRuleStart, css.indexOf('}', wrapperRuleStart));
    expect(wrapperRule).toContain('overflow: visible');
  });

  it('.cm-table-scroll is the one and only horizontal-clipping layer: overflow: visible by default, overflow-x: auto only for explicit-width tables', () => {
    const baseScrollStart = ruleIndex(css, '.cm-editor .cm-table-scroll');
    const baseScrollRule = css.slice(baseScrollStart, css.indexOf('}', baseScrollStart));
    expect(baseScrollRule).toContain('overflow: visible');
    expect(baseScrollRule).not.toContain('overflow-x: auto');

    const overrideScrollIndex = ruleIndex(css, '.cm-editor .cm-table-wrapper--explicit-widths .cm-table-scroll');
    expect(overrideScrollIndex).toBeGreaterThan(-1);
    const overrideScrollRule = css.slice(overrideScrollIndex, css.indexOf('}', overrideScrollIndex));
    expect(overrideScrollRule).toContain('overflow-x: auto');
  });

  it('the border lives on the table, not the outer wrapper — so it extends with an intrinsic-width table rather than staying pinned at the editor edge', () => {
    const wrapperRuleStart = ruleIndex(css, '.cm-editor .cm-table-wrapper {');
    const wrapperRule = css.slice(wrapperRuleStart, css.indexOf('}', wrapperRuleStart));
    expect(wrapperRule).not.toContain('border:');

    const tableRuleStart = ruleIndex(css, '.cm-editor .cm-table-wrapper table');
    const tableRule = css.slice(tableRuleStart, css.indexOf('border-collapse: separate', tableRuleStart));
    expect(tableRule).toContain('border: var(--cm-table-border-thickness)');
  });

  it('the whole-table-selected background/box-shadow paints the intrinsic <table> itself, not .cm-table-wrapper or .cm-table-scroll', () => {
    // Regression guard: `.cm-table-scroll` is unconditionally `width:
    // 100%; max-width: 100%` regardless of the table's own intrinsic
    // width, so it would always over-paint a smaller explicit-width table
    // and always under-paint an oversized one. `table` itself is the one
    // element whose own border-box always equals the actual rendered
    // table, at whatever intrinsic width it currently has.
    const selectedRuleStart = ruleIndex(css, '.cm-editor .cm-table-wrapper-selected table');
    expect(selectedRuleStart).toBeGreaterThan(-1);
    const selectedRule = css.slice(selectedRuleStart, css.indexOf('}', selectedRuleStart));
    expect(selectedRule).toContain('background: var(--selection-surface)');
    expect(selectedRule).toContain('box-shadow: inset 0 0 0 1.5px var(--surface-primary)');

    // The class must still land on `.cm-table-wrapper` itself in the DOM
    // (`tableWidget.ts`'s own `isSelected` toggle) — `tableSelectionHalo.test.ts`
    // and `tableDeletionSelection.test.ts` both assert that placement —
    // only the *paint target* changed; a bare rule targeting the wrapper
    // directly, or one targeting `.cm-table-scroll`, must not reappear.
    const bareWrapperSelectedIndex = css.indexOf('.cm-editor .cm-table-wrapper-selected {');
    expect(bareWrapperSelectedIndex).toBe(-1);
    const scrollTargetIndex = css.indexOf('.cm-editor .cm-table-wrapper-selected .cm-table-scroll');
    expect(scrollTargetIndex).toBe(-1);
  });

  it('the explicit-widths .cm-table-scroll override only adds overflow-x: auto — no breakout/centering geometry (cqw, calc, clamp, margin-left, padding-left, fit-content, margin-inline)', () => {
    const overrideScrollIndex = ruleIndex(css, '.cm-editor .cm-table-wrapper--explicit-widths .cm-table-scroll');
    const overrideScrollRule = css.slice(overrideScrollIndex, css.indexOf('}', overrideScrollIndex));

    expect(overrideScrollRule).toContain('overflow-x: auto');

    expect(overrideScrollRule).not.toContain('width:');
    expect(overrideScrollRule).not.toContain('max-width');
    expect(overrideScrollRule).not.toContain('margin');
    expect(overrideScrollRule).not.toContain('cqw');
    expect(overrideScrollRule).not.toContain('calc(');
    expect(overrideScrollRule).not.toContain('clamp(');
    expect(overrideScrollRule).not.toContain('fit-content');
    expect(overrideScrollRule).not.toContain('overscroll-behavior');
  });
});

function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), tableWidgetDecoration()],
  });
  return new EditorView({ state, parent });
}

const TABLE = '| Name | Role | City | Dept | Notes |\n| ---- | ---- | ---- | ---- | ----- |\n| Vik  | UI   | Chennai | Design | Long note text here |';

describe('TableWidget — colgroup drives the width architecture (DOM inputs to the CSS above)', () => {
  it('no metadata: wrapper does not get the explicit-widths class (table stays 100%, no scroll)', () => {
    const view = mountView(TABLE);

    const wrapper = view.dom.querySelector('.cm-table-wrapper')!;
    expect(wrapper.classList.contains('cm-table-wrapper--explicit-widths')).toBe(false);
    const colEls = view.dom.querySelectorAll('col');
    for (const col of colEls) {
      expect((col as HTMLElement).style.width).toBe('');
    }
  });

  it('explicit widths matching the reference example (306+120+120+120+240=906): wrapper gets the modifier class, <col> widths sum to 906', () => {
    const doc = `${TABLE}\n{table-col-widths="306,120,120,120,240"}`;
    const view = mountView(doc);

    const wrapper = view.dom.querySelector('.cm-table-wrapper')!;
    expect(wrapper.classList.contains('cm-table-wrapper--explicit-widths')).toBe(true);

    const colEls = Array.from(view.dom.querySelectorAll('col')) as HTMLElement[];
    const widths = colEls.map((c) => Number.parseInt(c.style.width, 10));
    expect(widths).toEqual([306, 120, 120, 120, 240]);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(906);
  });

  it('resizing the last column changes only its own <col> width, contributing directly to the table\'s own intrinsic (summed) width', () => {
    const doc = `${TABLE}\n{table-col-widths="306,120,120,120,240"}`;
    const view = mountView(doc);
    const attrStart = doc.indexOf('{table-col-widths');

    view.dispatch({ changes: { from: attrStart, to: doc.length, insert: '{table-col-widths="306,120,120,120,400"}' } });

    const colEls = Array.from(view.dom.querySelectorAll('col')) as HTMLElement[];
    const widths = colEls.map((c) => Number.parseInt(c.style.width, 10));
    expect(widths).toEqual([306, 120, 120, 120, 400]);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(1066);
  });
});
