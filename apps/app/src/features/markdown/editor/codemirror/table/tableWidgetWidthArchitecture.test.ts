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

  it('paints overflow gradients without layout or pointer ownership', () => {
    const fade = rule('.cm-editor .cm-table-wrapper::after');
    expect(fade).toContain('position: absolute');
    expect(fade).toContain('pointer-events: none');
    expect(fade).toContain('width: min(32px, var(--cm-table-fade-viewport-width, 0px))');
    expect(fade).toContain('transition: opacity 120ms ease');
    expect(css).toContain('linear-gradient(to right, var(--cm-table-fade-surface, var(--surface-primary)), transparent)');
    expect(css).toContain('linear-gradient(to left, var(--cm-table-fade-surface, var(--surface-primary)), transparent)');
    expect(fade).toContain('color-mix(in srgb, var(--cm-table-fade-color) 90%, transparent) 20%');
    expect(fade).toContain('color-mix(in srgb, var(--cm-table-fade-color) 10%, transparent) 80%');
    expect(css).toContain('@supports (color: color-mix(in srgb, black, transparent))');
    expect(css).toContain('linear-gradient(to right, var(--cm-table-fade-stops))');
    expect(css).toContain('linear-gradient(to left, var(--cm-table-fade-stops))');
  });

  it('keeps horizontal overflow and handle gutters in the scrollport', () => {
    const scroll = rule('.cm-editor .cm-table-wrapper--auto-widths .cm-table-scroll');
    expect(scroll).toContain('overflow-x: auto');
    expect(scroll).toContain('box-sizing: border-box');
    expect(scroll).toContain('padding-inline-start: var(--cm-table-handle-gutter)');
    expect(scroll).toContain('padding-block-start: var(--cm-table-handle-gutter)');
    expect(scroll).not.toContain('margin-block-start');
    expect(scroll).toContain('margin-inline-start: calc(-1 * var(--cm-table-handle-gutter))');
  });

  it('reserves control space independently from the actual table dimensions', () => {
    const scroll = rule('.cm-editor .cm-table-wrapper--auto-widths .cm-table-scroll');
    expect(scroll).toContain('--cm-table-inline-clearance: calc(2 * var(--cm-table-handle-gutter) + var(--cm-table-add-column-space))');
    expect(scroll).toContain('--cm-table-scroll-width: calc(100% + var(--cm-table-inline-clearance))');
    expect(scroll).toContain('width: var(--cm-table-scroll-width)');
    expect(scroll).toContain('max-width: var(--cm-table-scroll-width)');
    const layout = rule('.cm-editor .cm-table-wrapper--auto-widths .cm-table-layout');
    expect(rule('.cm-editor .cm-table-layout')).toContain('box-sizing: content-box');
    expect(scroll).toContain('padding-inline-end: calc(var(--cm-table-handle-gutter) + var(--cm-table-add-column-space))');
    expect(scroll).toContain('padding-block-end: var(--cm-table-add-row-space)');
    expect(layout).not.toContain('padding');
    expect(rule('.cm-editor .cm-table-layout')).not.toContain('padding');
    const inner = rule('.cm-editor .cm-table-inner');
    expect(inner).toContain('position: relative');
    expect(inner).toContain('width: 100%');
    expect(inner).not.toContain('flex:');
    const wrapper = rule('.cm-editor .cm-table-wrapper--auto-widths');
    expect(wrapper).toContain('--cm-table-add-size: var(--height-xs)');
    expect(wrapper).toContain('--cm-table-add-gap: 6px');
    expect(wrapper).toContain('--cm-table-add-column-space: 0px');
    expect(wrapper).toContain('--cm-table-add-row-space: 0px');
    const editable = rule('.cm-editor [data-table-engine-cells="true"] > .cm-table-wrapper--auto-widths');
    expect(editable).toContain('--cm-table-add-column-space: calc(var(--cm-table-add-size) + var(--cm-table-add-gap))');
    expect(editable).toContain('--cm-table-add-row-space: calc(var(--cm-table-add-size) + var(--cm-table-add-gap))');
  });

  it('fills the available width with equally distributed bounded columns', () => {
    const wrapper = rule('.cm-editor .cm-table-wrapper--auto-widths');
    expect(wrapper).toContain('--cm-table-column-min: 110px');
    expect(wrapper).toContain('--cm-table-column-max: 420px');
    const layout = rule('.cm-editor .cm-table-wrapper--auto-widths .cm-table-layout');
    expect(layout).toContain('width: clamp(calc(var(--cm-table-column-count) * var(--cm-table-column-min)), 100%, calc(var(--cm-table-column-count) * var(--cm-table-column-max)))');
    const table = rule('.cm-editor .cm-table-wrapper--auto-widths table');
    expect(table).toContain('table-layout: fixed');
    expect(table).toContain('width: 100%');
  });

  it('centres wider tables within the page pane, excluding asymmetric control padding', () => {
    const query = css.indexOf('@container clutter-page (min-width: 0px) {');
    expect(query).toBeGreaterThanOrEqual(0);
    const responsiveRule = css.slice(query, css.indexOf('}', query));
    expect(responsiveRule).toContain('--cm-table-page-cap: max(var(--cm-table-scroll-width), calc(100cqw - 2 * var(--cm-table-handle-gutter) - var(--cm-table-add-column-space)))');
    expect(responsiveRule).toContain('--cm-table-target-width: max(100%, var(--cm-table-column-count) * var(--cm-table-column-min))');
    expect(responsiveRule).toContain('--cm-table-visible-scroll-width: min(calc(var(--cm-table-target-width) + var(--cm-table-inline-clearance)), var(--cm-table-page-cap))');
    expect(responsiveRule).toContain('width: var(--cm-table-visible-scroll-width)');
    expect(responsiveRule).toContain('max-width: var(--cm-table-page-cap)');
    expect(responsiveRule).toContain('margin-inline-start: calc((100% - min(var(--cm-table-target-width), calc(var(--cm-table-visible-scroll-width) - var(--cm-table-handle-gutter)))) / 2 - var(--cm-table-handle-gutter))');
    const pageCss = readFileSync(join(__dirname, '../../../../../app/layouts/page/Page.css'), 'utf8');
    expect(pageCss).toContain('container: clutter-page / inline-size');
    expect(pageCss).toContain('overflow-x: hidden');
  });

  it('anchors both controls outside the table and retains edge-specific hover', () => {
    expect(rule('.cm-editor .cm-table-quick-add')).toContain('opacity: 0');
    expect(rule('.cm-editor .cm-table-quick-add-track')).toContain('position: absolute');
    const row = rule('.cm-editor .cm-table-quick-add-track-row');
    expect(row).toContain('inset-block-start: 100%');
    expect(row).toContain('inset-inline: 0');
    expect(row).toContain('height: var(--cm-table-add-row-space)');
    expect(row).toContain('padding-block-start: var(--cm-table-add-gap)');
    const column = rule('.cm-editor .cm-table-quick-add-track-column');
    expect(column).toContain('inset-inline-start: 100%');
    expect(column).toContain('inset-block: 0');
    expect(column).toContain('width: var(--cm-table-add-column-space)');
    expect(column).toContain('padding-inline-start: var(--cm-table-add-gap)');
    expect(rule('.cm-editor .cm-table-quick-add-row')).toContain('height: var(--cm-table-add-size)');
    const button = rule('.cm-editor .cm-table-quick-add-column');
    expect(button).toContain('width: var(--cm-table-add-size)');
    expect(button).toContain('height: 100%');
    expect(css).toContain('.cm-table-inner:has(> table > tbody > tr:last-child:hover) > .cm-table-quick-add-track-row > .cm-table-quick-add-row');
    expect(css).toContain('.cm-table-inner:has(> table > tbody:empty):has(> table > thead > tr:last-child:hover) > .cm-table-quick-add-track-row > .cm-table-quick-add-row');
    expect(css).toContain('.cm-table-inner:has(> table > :is(thead, tbody) > tr > :is(th, td):last-child:hover) > .cm-table-quick-add-track-column > .cm-table-quick-add-column');
    expect(css).toContain('.cm-table-quick-add:focus-visible');
    expect(css).toContain('.cm-table-quick-add-track:hover > .cm-table-quick-add');
    const svg = rule('.cm-editor .cm-table-quick-add svg');
    expect(svg).toContain('width: 16px');
    expect(svg).toContain('height: 16px');
    expect(svg).not.toContain('stroke-width');
  });

  it('shares the existing non-interactive selection overlay styling rather than a second cell outline', () => {
    const overlay = readFileSync(join(__dirname, 'tableSelectionOverlay.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(overlay).toMatch(/\.cm-table-selection-overlay\s*\{[^}]*position: absolute;/);
    expect(overlay).toMatch(/\.cm-table-selection-overlay\s*\{[^}]*border: 2px solid var\(--border-focus\);/);
    expect(overlay).toMatch(/\.cm-table-selection-overlay\s*\{[^}]*pointer-events: none;/);
    expect(css).not.toContain(':has(> .cm-table-cell-wrapper > .cm-editor)');
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
  it('suppresses only the original selection and controls during reordering, not the ghost', () => {
    expect(rule('.cm-editor [data-table-engine-cells="true"] .cm-table-dragging-active > .cm-table-scroll > .cm-table-selection-overlay')).toContain('visibility: hidden');
    expect(css).not.toContain('.cm-table-dragging-active .cm-table-selection-overlay {');
    const track = rule('.cm-editor .cm-table-dragging-active .cm-table-quick-add-track');
    expect(track).toContain('visibility: hidden');
    expect(track).toContain('pointer-events: none');
    const handleCss = readFileSync(join(__dirname, 'tableHandleOverlay.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
    const indicator = handleCss.slice(handleCss.lastIndexOf('.cm-table-column-drop-indicator {'));
    expect(indicator).not.toContain('top: 0');
    expect(indicator).not.toContain('bottom: 0');
    expect(handleCss).toMatch(/\.cm-table-wrapper\.cm-table-dragging-active :is\(th, td\) > :is\([^)]*\) \{ display: none;/);
  });

});
