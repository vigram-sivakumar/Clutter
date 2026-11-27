// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { undoDepth } from '@codemirror/commands';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkdownEditor } from '../../MarkdownEditor';
import { openExternalUrl } from '@shared/helpers/openExternalUrl';

vi.mock('@shared/helpers/openExternalUrl', async (original) => ({
  ...(await original<typeof import('@shared/helpers/openExternalUrl')>()),
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

const writeText = vi.fn().mockResolvedValue(undefined);
const rect = (
  left: number,
  top: number,
  width: number,
  height: number
): DOMRect => ({
  x: left,
  y: top,
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  toJSON() {},
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.classList.contains('overlay__surface'))
        return rect(0, 0, 200, 120);
      if (
        this.getAttribute('aria-hidden') === 'true' &&
        this.style.position === 'fixed'
      ) {
        return rect(
          Number.parseFloat(this.style.left),
          Number.parseFloat(this.style.top),
          0,
          0
        );
      }
      return rect(0, 0, 0, 0);
    }
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

let sequence = 0;
function setup(
  source = '[Different display](https://example.com/path)',
  readOnly = false
) {
  const doc = `before ${source} after`;
  const { container } = render(
    <MarkdownEditor
      pageId={`link-menu-${++sequence}`}
      markdown={doc}
      readOnly={readOnly}
    />
  );
  const content = container.querySelector<HTMLElement>('.cm-content')!;
  const view = EditorView.findFromDOM(content)!;
  const pos = doc.indexOf(source) + (source.startsWith('[') ? 3 : 2);
  vi.spyOn(view, 'posAtCoords').mockReturnValue(pos);
  vi.spyOn(view, 'coordsAtPos').mockReturnValue(rect(0, 0, 1024, 768));
  const dom = view.domAtPos(pos);
  const target =
    dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement!;
  const rightClick = (x = 40, y = 50) => {
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: x,
      clientY: y,
    });
    act(() => {
      const current = view.domAtPos(pos).node;
      (current instanceof HTMLElement
        ? current
        : current.parentElement!
      ).dispatchEvent(event);
    });
    return event;
  };
  return { view, content, target, rightClick };
}

function labels() {
  return screen.getAllByRole('menuitem').map((item) => item.textContent);
}

describe('editor URL context menu', () => {
  it.each([
    '[Different display](https://example.com/path)',
    '<https://example.com/path>',
    'https://example.com/path',
  ])('opens exactly three shared menu actions on %s', (source) => {
    const { rightClick, view } = setup(source);
    const before = view.state.doc.toString();
    expect(rightClick().defaultPrevented).toBe(true);
    expect(labels()).toEqual([
      'Copy URL',
      'Copy as Markdown',
      'Open in Browser',
    ]);
    expect(document.querySelector('.overlay__surface .menu')).not.toBeNull();
    expect(view.state.doc.toString()).toBe(before);
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  it.each([
    [
      '[Different display](https://example.com/path)',
      '[Different display](https://example.com/path)',
    ],
    [
      '[**Formatted**](https://example.com/path "Title")',
      '[**Formatted**](https://example.com/path "Title")',
    ],
    ['<https://example.com/path>', '<https://example.com/path>'],
    ['https://example.com/path', '<https://example.com/path>'],
  ])(
    'copies reusable Markdown for %s and dismisses',
    async (source, markdown) => {
      const { rightClick } = setup(source);
      rightClick();
      fireEvent.click(screen.getByText('Copy as Markdown'));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(markdown));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    }
  );

  it('copies the destination, rather than its display text, and dismisses', async () => {
    const { rightClick } = setup();
    rightClick();
    fireEvent.click(screen.getByText('Copy URL'));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('https://example.com/path')
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens the destination through the system-browser helper and dismisses', () => {
    const { rightClick } = setup();
    rightClick();
    fireEvent.click(screen.getByText('Open in Browser'));
    expect(openExternalUrl).toHaveBeenCalledExactlyOnceWith(
      'https://example.com/path'
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('dismisses with Escape and restores editor focus', () => {
    const { rightClick, content } = setup();
    rightClick();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(content).toHaveFocus();
  });

  it('dismisses on an outside click', () => {
    const { rightClick } = setup();
    rightClick();
    fireEvent.click(document.querySelector('.overlay__backdrop')!);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('anchors at the pointer', () => {
    const { rightClick } = setup();
    rightClick(40, 50);
    const surface = document.querySelector<HTMLElement>('.overlay__surface')!;
    expect(Number.parseFloat(surface.style.left)).toBe(40);
    expect(Number.parseFloat(surface.style.top)).toBe(50);
  });

  it('keeps the menu inside the viewport at the bottom-right corner', () => {
    const { rightClick } = setup();
    rightClick(window.innerWidth - 1, window.innerHeight - 1);
    const surface = document.querySelector<HTMLElement>('.overlay__surface')!;
    const left = Number.parseFloat(surface.style.left);
    const top = surface.style.top
      ? Number.parseFloat(surface.style.top)
      : window.innerHeight - Number.parseFloat(surface.style.bottom) - 120;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + 200).toBeLessThanOrEqual(window.innerWidth);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top + 120).toBeLessThanOrEqual(window.innerHeight);
  });

  it('leaves ordinary left-click navigation unchanged', () => {
    const { target } = setup();
    fireEvent.mouseDown(target, { button: 0, clientX: 40, clientY: 50 });
    expect(openExternalUrl).toHaveBeenCalledExactlyOnceWith(
      'https://example.com/path'
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it.each([
    'ordinary text',
    '`https://example.com`',
    '![Alt](https://example.com/image.png)',
  ])('leaves non-link right-click behaviour unchanged: %s', (source) => {
    const { rightClick } = setup(source);
    expect(rightClick().defaultPrevented).toBe(false);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  it('rejects blank space that CodeMirror maps to a link boundary', () => {
    const { rightClick, view } = setup();
    vi.mocked(view.coordsAtPos).mockReturnValue(rect(10, 10, 100, 20));
    expect(rightClick(500, 20).defaultPrevented).toBe(false);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('works when the caret has revealed a Markdown link source', () => {
    const { view, rightClick } = setup();
    act(() => {
      view.dispatch({ selection: { anchor: 12 } });
    });
    rightClick();
    expect(labels()).toEqual([
      'Copy URL',
      'Copy as Markdown',
      'Open in Browser',
    ]);
  });

  it('uses the active table cell editor’s own document coordinates', async () => {
    const { container } = render(
      <MarkdownEditor
        pageId={`link-table-${++sequence}`}
        markdown={'| Heading |\n| --- |\n| [Cell](https://cell.example/path) |'}
      />
    );
    const cell = container.querySelector('tbody td')!;
    fireEvent.mouseDown(cell, { button: 0, clientX: 10, clientY: 10 });
    await act(async () => {});
    const content = container.querySelector<HTMLElement>('tbody .cm-content')!;
    expect(content).not.toBeNull();
    const nested = EditorView.findFromDOM(content)!;
    expect(nested.state.doc.toString()).toBe(
      '[Cell](https://cell.example/path)'
    );
    vi.spyOn(nested, 'posAtCoords').mockReturnValue(2);
    vi.spyOn(nested, 'coordsAtPos').mockReturnValue(rect(0, 0, 1024, 768));
    fireEvent.contextMenu(content, { button: 2, clientX: 40, clientY: 50 });
    fireEvent.click(screen.getByText('Copy URL'));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('https://cell.example/path')
    );
  });

  it('uses the captured link even if the editor content changes while the menu is open', async () => {
    const { view, rightClick } = setup();
    rightClick();
    act(() => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: 'Replaced' },
      });
    });
    fireEvent.click(screen.getByText('Copy as Markdown'));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        '[Different display](https://example.com/path)'
      )
    );
  });

  it('offers the same non-mutating actions in read-only notes', () => {
    const { rightClick } = setup(
      '[Different display](https://example.com/path)',
      true
    );
    rightClick();
    expect(labels()).toEqual([
      'Copy URL',
      'Copy as Markdown',
      'Open in Browser',
    ]);
  });
});


describe('static table link context menu', () => {
  function setupTable(source: string, readOnly = false) {
    const doc = '| Heading |\n| --- |\n| ' + source + ' |';
    const { container } = render(
      <MarkdownEditor pageId={`static-link-table-${++sequence}`} markdown={doc} readOnly={readOnly} />
    );
    const content = container.querySelector<HTMLElement>('.cm-content')!;
    const view = EditorView.findFromDOM(content)!;
    const host = container.querySelector<HTMLElement>('tbody [data-cell]')!;
    const widget = host.closest('.cm-table-widget');
    expect(widget).not.toBeNull();
    // Verify the actual projection mode: the interactive engine marker
    // is absent in read-only, but the same widget owns the painted links.
    expect(widget!.hasAttribute('data-table-engine-cells')).toBe(!readOnly);
    const rightClick = (target: Element) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 40, clientY: 50 });
      act(() => { target.dispatchEvent(event); });
      return event;
    };
    return { doc, container, view, content, host, rightClick };
  }

  describe.each([false, true])('readOnly=%s', readOnly => {
    it.each([
      ['[**Formatted**](https://example.com/path "Title")', '.tok-strong', 'https://example.com/path', '[**Formatted**](https://example.com/path "Title")'],
      ['<person@example.com>', '.tok-link-title', 'mailto:person@example.com', '<person@example.com>'],
      ['www.example.com/path', '.tok-link-title', 'https://www.example.com/path', '[www.example.com/path](<https://www.example.com/path>)'],
    ])('reuses all three actions on %s without entering cell editing', async (source, selector, url, markdown) => {
      const { doc, container, view, host, rightClick } = setupTable(source, readOnly);
      const hit = host.querySelector(selector)!;
      expect(hit).not.toBeNull();
      const depth = undoDepth(view.state);
      expect(rightClick(hit).defaultPrevented).toBe(true);
      expect(labels()).toEqual(['Copy URL', 'Copy as Markdown', 'Open in Browser']);
      expect(openExternalUrl).not.toHaveBeenCalled();
      fireEvent.click(screen.getByText('Copy URL'));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
      expect(rightClick(hit).defaultPrevented).toBe(true);
      fireEvent.click(screen.getByText('Copy as Markdown'));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(markdown));
      expect(rightClick(hit).defaultPrevented).toBe(true);
      fireEvent.click(screen.getByText('Open in Browser'));
      expect(openExternalUrl).toHaveBeenCalledExactlyOnceWith(url);
      expect(container.querySelector('tbody .cm-editor')).toBeNull();
      expect(view.state.doc.toString()).toBe(doc);
      expect(undoDepth(view.state)).toBe(depth);
    });

    it('does not turn padding, code, WikiLinks or destinationless text into URL menu hits', () => {
      const { doc, view, host, rightClick } = setupTable('[Site](https://example.com) `https://example.net` [[Note]] [literal]', readOnly);
      // Even if root coordinates resolve to a URL, only the real static link hit qualifies.
      vi.spyOn(view, 'posAtCoords').mockReturnValue(doc.indexOf('Site') + 1);
      vi.spyOn(view, 'coordsAtPos').mockReturnValue(rect(0, 0, 1024, 768));
      for (const target of [host, host.querySelector('.tok-code')!, host.querySelector('.tok-wikilink')!]) {
        expect(target).not.toBeNull();
        expect(rightClick(target).defaultPrevented).toBe(false);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      }
      expect(openExternalUrl).not.toHaveBeenCalled();
      expect(view.state.doc.toString()).toBe(doc);
    });
  });

  it('copies the exact second occurrence when two formatted labels are identical', async () => {
    const second = '[**Same**](https://second.example "Second")';
    const { host, view, content, doc, rightClick } = setupTable('[**Same**](https://first.example) ' + second);
    const links = host.querySelectorAll('.tok-link');
    expect(links).toHaveLength(2);
    expect(rightClick(links[1]!.querySelector('.tok-strong')!).defaultPrevented).toBe(true);
    fireEvent.click(screen.getByText('Copy as Markdown'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(second));
    expect(view.state.doc.toString()).toBe(doc);
    expect(rightClick(links[0]!.querySelector('.tok-strong')!).defaultPrevented).toBe(true);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(content).toHaveFocus();
  });
});
