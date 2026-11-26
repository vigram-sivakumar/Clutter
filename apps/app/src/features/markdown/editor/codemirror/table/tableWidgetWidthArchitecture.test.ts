import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom cannot compute the actual layout. Assert the stylesheet contract;
// real scroll/handle clipping remains a native smoke-test requirement.
const css = readFileSync(join(__dirname, 'tableWidget.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
function rule(selector: string): string {
  const start = css.indexOf(selector + ' {');
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

describe('automatic table sizing stylesheet', () => {
  it('never clips at the block widget or outer wrapper', () => {
    expect(rule('.cm-editor .cm-table-widget')).toContain('overflow: visible');
    const wrapper = rule('.cm-editor .cm-table-wrapper');
    expect(wrapper).toContain('overflow: visible');
    expect(wrapper).toContain('max-width: 100%');
  });

  it('keeps horizontal overflow in the scrollport', () => {
    const scroll = rule('.cm-editor .cm-table-wrapper--auto-widths .cm-table-scroll');
    expect(scroll).toContain('overflow-x: auto');
    expect(scroll).toContain('padding-bottom: 12px');
  });

  it('keeps intrinsic tracks and content-sized columns', () => {
    expect(rule('.cm-editor .cm-table-wrapper--auto-widths .cm-table-layout')).toContain('width: max-content');
    expect(rule('.cm-editor .cm-table-wrapper--auto-widths .cm-table-inner')).toContain('width: max-content');
    const table = rule('.cm-editor .cm-table-wrapper--auto-widths table');
    expect(table).toContain('table-layout: auto');
    expect(table).toContain('width: max-content');
  });

  it('retains bounded cell widths and wrapping', () => {
    const cell = rule('.cm-editor .cm-table-wrapper--auto-widths .cm-table-cell-wrapper');
    expect(cell).toContain('min-width:');
    expect(cell).toContain('max-width:');
    expect(cell).toContain('overflow-wrap: anywhere');
  });

  it('keeps normal table borders without whole-table selection styling', () => {
    expect(rule('.cm-editor .cm-table-wrapper table')).toContain('border:');
    expect(css).not.toContain('cm-table-wrapper-selected');
  });

  it('does not contain the retired explicit-width selectors', () => {
    expect(css).not.toContain('cm-table-wrapper--explicit-widths');
    expect(css).not.toContain('table-breakout-max-width');
  });
});
