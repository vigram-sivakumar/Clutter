// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { TemplateSuggestions } from './TemplateSuggestions';

function template(
  id: string,
  name: string,
  emoji: string | null = null
): CollectionEntryModel {
  return {
    id,
    type: 'note',
    icon: 'template',
    emoji,
    selected: false,
    onClick: vi.fn(),
    values: { name },
  } as CollectionEntryModel;
}

const NO_OVERFLOW_CLICK = vi.fn();

afterEach(cleanup);

describe('TemplateSuggestions', () => {
  it('renders one entry per template with its title', () => {
    render(
      <TemplateSuggestions
        templates={[template('a', 'Meeting'), template('b', 'Journal')]}
        onSelect={vi.fn()}
        onOverflowClick={NO_OVERFLOW_CLICK}
      />
    );

    expect(screen.getByText('Meeting')).toBeTruthy();
    expect(screen.getByText('Journal')).toBeTruthy();
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it('calls onSelect with the clicked template, not the entry onClick', () => {
    const onSelect = vi.fn();
    const meeting = template('a', 'Meeting');
    const journal = template('b', 'Journal');
    render(
      <TemplateSuggestions
        templates={[meeting, journal]}
        onSelect={onSelect}
        onOverflowClick={NO_OVERFLOW_CLICK}
      />
    );

    fireEvent.click(screen.getByText('Journal'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(journal);
    expect(journal.onClick).not.toHaveBeenCalled();
  });

  it("shows each template's own emoji as the entry's leading icon, and the template icon when it has none", () => {
    const { container } = render(
      <TemplateSuggestions
        templates={[
          template('a', 'Meeting', '📅'),
          template('b', 'Journal'),
          template('c', 'Notes', '📝'),
        ]}
        onSelect={vi.fn()}
        onOverflowClick={NO_OVERFLOW_CLICK}
      />
    );

    const leadings = [
      ...container.querySelectorAll(
        '[data-suggestion="template"] .entry__leading'
      ),
    ];

    expect(
      leadings.map(
        (leading) => leading.querySelector('.emoji-icon')?.textContent ?? null
      )
    ).toEqual(['📅', null, '📝']);
    // The one without an emoji falls back to the template icon (an svg), not an empty slot.
    expect(leadings[1]!.querySelector('svg')).not.toBeNull();
  });

  it('renders without entries for an empty array', () => {
    render(
      <TemplateSuggestions
        templates={[]}
        onSelect={vi.fn()}
        onOverflowClick={NO_OVERFLOW_CLICK}
      />
    );

    expect(screen.getByText(/Start with template/)).toBeTruthy();
    expect(screen.queryByText(/more$/)).toBeNull();
  });
});

describe('TemplateSuggestions — overflow', () => {
  // jsdom has no layout: every measured element is 100px wide (the "+N more" entry too), the gap is 10px, and the available width is whatever the test sets as the container's own width.
  let availableWidth = 0;
  let entryWidth = 100;
  let resizeCallbacks: ResizeObserverCallback[] = [];

  beforeEach(() => {
    availableWidth = 0;
    entryWidth = 100;
    resizeCallbacks = [];
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        const width = this.tagName === 'SPAN' ? 0 : entryWidth;
        return {
          width,
          height: 20,
          top: 0,
          left: 0,
          right: width,
          bottom: 20,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      }
    );
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      columnGap: '10px',
    } as CSSStyleDeclaration);
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => availableWidth,
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallbacks.push(callback);
        }
        observe() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // @ts-expect-error — remove the test's own override
    delete HTMLElement.prototype.clientWidth;
    // @ts-expect-error — remove the test's own override
    delete document.fonts;
  });

  const five = ['A', 'B', 'C', 'D', 'E'].map((name) =>
    template(name.toLowerCase(), name)
  );

  const renderRow = (onOverflowClick = vi.fn()) =>
    render(
      <TemplateSuggestions
        templates={five}
        onSelect={vi.fn()}
        onOverflowClick={onOverflowClick}
      />
    );

  it('shows every template and no overflow entry when the row fits', () => {
    availableWidth = 5 * 100 + 4 * 10;

    renderRow();

    expect(
      ['A', 'B', 'C', 'D', 'E'].every((name) => screen.queryByText(name))
    ).toBe(true);
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it('shows the templates that fit plus "+N more" counting the hidden ones, with room kept for it', () => {
    // 3 entries + overflow = 4 × 100 + 3 × 10 = 430 ≤ 450; 4 entries + overflow = 540 > 450.
    availableWidth = 450;

    renderRow();

    expect(screen.queryByText('A')).toBeTruthy();
    expect(screen.queryByText('C')).toBeTruthy();
    expect(screen.queryByText('D')).toBeNull();
    expect(screen.getByText('+2 more')).toBeTruthy();
  });

  it('recalculates the count when the available width changes', () => {
    availableWidth = 450;
    renderRow();
    expect(screen.getByText('+2 more')).toBeTruthy();

    availableWidth = 230;
    act(() =>
      resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver))
    );
    // 1 entry + overflow = 210 ≤ 230; 2 entries + overflow = 320 > 230.
    expect(screen.getByText('+4 more')).toBeTruthy();
    expect(screen.queryByText('B')).toBeNull();

    availableWidth = 1000;
    act(() =>
      resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver))
    );
    expect(screen.queryByText(/more$/)).toBeNull();
    expect(screen.queryByText('E')).toBeTruthy();
  });

  it('still shows "+N more" when not even one template fits', () => {
    availableWidth = 120;

    renderRow();

    expect(screen.queryByText('A')).toBeNull();
    expect(screen.getByText('+5 more')).toBeTruthy();
  });

  it('"+N more" only reports the click (with its element); it selects nothing', () => {
    availableWidth = 450;
    const onSelect = vi.fn();
    const onOverflowClick = vi.fn();
    render(
      <TemplateSuggestions
        templates={five}
        onSelect={onSelect}
        onOverflowClick={onOverflowClick}
      />
    );

    fireEvent.click(screen.getByText('+2 more'));

    expect(onSelect).not.toHaveBeenCalled();
    expect(onOverflowClick).toHaveBeenCalledTimes(1);
    expect(onOverflowClick.mock.calls[0]![0]).toBeInstanceOf(HTMLElement);
  });

  it('measures again once the web fonts have loaded, since entry widths change with the font', async () => {
    let fontsLoaded!: () => void;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        status: 'loading',
        ready: new Promise<void>((resolve) => (fontsLoaded = resolve)),
      },
    });
    availableWidth = 450;
    renderRow();
    // Measured in the fallback font (100px entries): three fit beside "+2 more".
    expect(screen.getByText('+2 more')).toBeTruthy();

    entryWidth = 50;
    await act(async () => fontsLoaded());

    // In the real font every entry is 50px wide, so all five fit and there is no overflow entry.
    expect(screen.queryByText(/more$/)).toBeNull();
    expect(screen.queryByText('E')).toBeTruthy();
  });

  it('includes the emoji in what is measured: a changed emoji re-measures the row', () => {
    availableWidth = 450;
    const plain = ['A', 'B', 'C', 'D', 'E'].map((name) =>
      template(name.toLowerCase(), name)
    );
    const { rerender } = render(
      <TemplateSuggestions
        templates={plain}
        onSelect={vi.fn()}
        onOverflowClick={vi.fn()}
      />
    );
    expect(screen.getByText('+2 more')).toBeTruthy();

    // Same ids and names, but the emoji (a wider leading icon) now changes the entries' measured widths.
    entryWidth = 50;
    rerender(
      <TemplateSuggestions
        templates={plain.map((entry) => ({ ...entry, emoji: '📅' }))}
        onSelect={vi.fn()}
        onOverflowClick={vi.fn()}
      />
    );

    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it('does not re-measure for fonts that were already loaded', () => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { status: 'loaded', ready: Promise.resolve() },
    });
    availableWidth = 450;
    const getRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');

    renderRow();

    // One measuring pass: five entries plus the overflow entry.
    expect(getRect).toHaveBeenCalledTimes(6);
  });
});

describe('TemplateSuggestions — entry width cascade', () => {
  it("sizes entries with a two-class selector, so Entry's `.entry { width: 100% }` cannot win by stylesheet order", () => {
    const read = (file: string) =>
      readFileSync(join(__dirname, file), 'utf8').replace(
        /\/\*[\s\S]*?\*\//g,
        ''
      );
    const rule = read('TemplateSuggestions.css').match(
      /([^{}]+)\{[^{}]*width:\s*fit-content[^{}]*\}/
    );

    expect(rule?.[1]?.trim()).toBe(
      '.template-suggestions__list .template-suggestions__item'
    );
    // The rule it has to beat: a single-class `.entry` that sets width: 100%.
    expect(read('../entry/Entry.css')).toMatch(
      /\.entry\s*\{[^}]*width:\s*100%/
    );
  });
});
