// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { buildCompletionRow, buildCompletionSectionHeader, renderCompletionRow } from './completionRow';

function mountView(): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({ state: EditorState.create(), parent });
}

const ICON = '<svg viewBox="0 0 16 16"></svg>';

describe('buildCompletionRow', () => {
  it('lays out an icon, the title, and the path (joined with " / ") on its own line below it', () => {
    const row = buildCompletionRow({ iconSvg: ICON, title: 'Plan', path: 'Projects/Work' }, mountView());

    expect(row.className).toBe('completion-row');
    expect(row.querySelector('.completion-row__icon svg')).not.toBeNull();
    expect(row.querySelector('.completion-row__title')?.textContent).toBe('Plan');
    expect(row.querySelector('.completion-row__path')?.textContent).toBe('Projects / Work');
  });

  it('shows the trailing text and no path — the two are alternatives, as in PickerList', () => {
    const row = buildCompletionRow({ title: 'Overview', path: 'A/B', trailing: 'H2' }, mountView());

    expect(row.querySelector('.completion-row__trailing')?.textContent).toBe('H2');
    expect(row.querySelector('.completion-row__path')).toBeNull();
  });

  it('shows a title suffix (a matched alias) after the title', () => {
    const row = buildCompletionRow({ title: 'Billing', titleSuffix: 'Invoices' }, mountView());

    expect(row.querySelector('.completion-row__suffix')?.textContent).toBe('Invoices');
  });

  it('shows a note\'s emoji in place of its icon', () => {
    const row = buildCompletionRow({ iconSvg: ICON, emoji: '🚀', title: 'Alpha' }, mountView());

    expect(row.querySelector('.completion-row__emoji')?.textContent).toBe('🚀');
    expect(row.querySelector('svg')).toBeNull();
  });

  it('draws an image URL as the asset row\'s thumbnail, in place of the icon', () => {
    const row = buildCompletionRow({ iconSvg: ICON, thumbnail: 'app://hero.png', title: 'hero.png' }, mountView());

    expect(row.classList.contains('completion-row--asset')).toBe(true);
    expect(row.querySelector('.completion-row__thumbnail img')?.getAttribute('src')).toBe('app://hero.png');
    expect(row.querySelector('svg')).toBeNull();
  });

  it('waits for a thumbnail promise, then swaps in the image', async () => {
    let resolve!: (src: string | null) => void;
    const row = buildCompletionRow(
      { iconSvg: ICON, thumbnail: new Promise<string | null>((r) => (resolve = r)), title: 'plan.pdf' },
      mountView()
    );
    expect(row.querySelector('.completion-row__thumbnail img')).toBeNull();

    resolve('data:image/png;base64,AAAA');
    await Promise.resolve();
    await Promise.resolve();

    expect(row.querySelector('.completion-row__thumbnail img')).not.toBeNull();
  });

  it('keeps the icon when the thumbnail promise yields nothing (an unreadable PDF)', async () => {
    const row = buildCompletionRow({ iconSvg: ICON, thumbnail: Promise.resolve(null), title: 'plan.pdf' }, mountView());
    await Promise.resolve();
    await Promise.resolve();

    expect(row.querySelector('.completion-row__thumbnail img')).toBeNull();
    expect(row.querySelector('.completion-row__thumbnail svg')).not.toBeNull();
  });
});

describe('renderCompletionRow', () => {
  it('draws a completion that carries a row', () => {
    const view = mountView();
    const node = renderCompletionRow({ label: 'x', row: { title: 'Plan' } } as never, view.state, view);

    expect(node?.querySelector('.completion-row__title')?.textContent).toBe('Plan');
  });

  it('leaves a completion with no row to CM6', () => {
    const view = mountView();

    expect(renderCompletionRow({ label: 'plain' }, view.state, view)).toBeNull();
  });
});

describe('buildCompletionSectionHeader', () => {
  it('is a divider above the section\'s title', () => {
    const header = buildCompletionSectionHeader('Daily notes');

    expect(header.querySelector('[role="separator"]')).not.toBeNull();
    expect(header.querySelector('.completion-section__title')?.textContent).toBe('Daily notes');
  });
});
