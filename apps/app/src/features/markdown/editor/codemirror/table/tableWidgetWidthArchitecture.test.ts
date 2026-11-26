import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom cannot compute the actual layout. Assert the stylesheet contract;
// real scroll/handle clipping remains a native smoke-test requirement.
const css = readFileSync(join(__dirname, 'tableWidget.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .replace(/\(\s+/g, '(')
  .replace(/\s+\)/g, ')')
  .replace(/'/g, '"');
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

  it('keeps horizontal overflow and handle gutters in the scrollport', () => {
    const scroll = rule('.cm-editor .cm-table-wrapper--auto-widths .cm-table-scroll');
    expect(scroll).toContain('overflow-x: auto');
    expect(scroll).toContain('box-sizing: border-box');
    expect(scroll).toContain('padding-inline: var(--cm-table-handle-gutter)');
    expect(scroll).toContain('margin-inline-start: calc(-1 * var(--cm-table-handle-gutter))');
  });

  it('pairs the expanded border-box with its padding so the add-column track is extra', () => {
    const scroll = rule('.cm-editor .cm-table-wrapper--auto-widths .cm-table-scroll');
    expect(scroll).toContain('calc(100% + 2 * var(--cm-table-handle-gutter) + var(--cm-table-add-column-space))');
    expect(scroll).toContain('width: var(--cm-table-scroll-width)');
    expect(scroll).toContain('max-width: var(--cm-table-scroll-width)');
    const layout = rule('.cm-editor .cm-table-wrapper--auto-widths .cm-table-layout');
    expect(layout).toContain('100%,');
    const inner = rule('.cm-editor .cm-table-wrapper--auto-widths .cm-table-inner');
    expect(inner).toContain('width: calc(100% - var(--cm-table-add-column-space))');
    expect(inner).toContain('flex: 0 0 calc(100% - var(--cm-table-add-column-space))');
    const wrapper = rule('.cm-editor .cm-table-wrapper--auto-widths');
    expect(wrapper).toContain('--cm-table-add-column-width: var(--height-xs)');
    expect(rule('.cm-editor [data-table-engine-cells="true"] > .cm-table-wrapper--auto-widths')).toContain('--cm-table-add-column-space: calc(var(--cm-table-add-column-width) + 6px)');
    const track = rule('.cm-editor .cm-table-quick-add-track-column');
    expect(track).toContain('flex: 0 0 var(--cm-table-add-column-space)');
    expect(track).toContain('width: var(--cm-table-add-column-space)');
    expect(track).toContain('padding-inline-start: 6px');
    const button = rule('.cm-editor .cm-table-quick-add-column');
    expect(button).toContain('width: var(--cm-table-add-column-width)');
    expect(button).toContain('flex: 0 0 var(--cm-table-add-column-width)');
  });

  it('fills the available width with equally distributed bounded columns', () => {
    const wrapper = rule('.cm-editor .cm-table-wrapper--auto-widths');
    expect(wrapper).toContain('--cm-table-column-min: 110px');
    expect(wrapper).toContain('--cm-table-column-max: 420px');
    expect(wrapper).toContain('--cm-table-add-column-space: 0px');
    const layout = rule('.cm-editor .cm-table-wrapper--auto-widths .cm-table-layout');
    expect(layout).toContain('width: clamp(');
    expect(layout).toContain('var(--cm-table-column-count) * var(--cm-table-column-min)');
    expect(layout).toContain('var(--cm-table-column-count) * var(--cm-table-column-max)');
    expect(rule('.cm-editor .cm-table-wrapper--auto-widths .cm-table-inner')).toContain('width: calc(100% - var(--cm-table-add-column-space))');
    const table = rule('.cm-editor .cm-table-wrapper--auto-widths table');
    expect(table).toContain('table-layout: fixed');
    expect(table).toContain('width: 100%');
  });

  it('keeps quick-add controls in layout and uses edge-specific hover', () => {
    expect(rule('.cm-editor .cm-table-quick-add')).toContain('opacity: 0');
    expect(css).toContain('.cm-table-inner:has(> table > tbody > tr:last-child:hover) > .cm-table-quick-add-track-row > .cm-table-quick-add-row');
    expect(css).toContain('.cm-table-inner:has(> table > tbody:empty):has(> table > thead > tr:last-child:hover) > .cm-table-quick-add-row');
    expect(css).toContain('.cm-table-layout:has(> .cm-table-inner > table > :is(thead, tbody) > tr > :is(th, td):last-child:hover) > .cm-table-quick-add-track-column > .cm-table-quick-add-column');
    expect(css).toContain('.cm-table-quick-add:focus-visible');
    expect(css).toContain('.cm-table-quick-add-track:hover > .cm-table-quick-add');
    expect(rule('.cm-editor .cm-table-quick-add-track-row')).toContain('padding-block-start: 6px');
    expect(rule('.cm-editor .cm-table-quick-add-track-column')).toContain('padding-inline-start: 6px');
    expect(rule('.cm-editor .cm-table-layout')).toContain('gap: 0');
    expect(rule('.cm-editor .cm-table-inner')).toContain('gap: 0');
    const svg = rule('.cm-editor .cm-table-quick-add svg');
    expect(svg).toContain('width: 16px');
    expect(svg).toContain('height: 16px');
    expect(svg).not.toContain('stroke-width');
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
