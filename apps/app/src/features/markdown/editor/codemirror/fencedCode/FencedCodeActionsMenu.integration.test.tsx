// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkdownEditor } from '../../MarkdownEditor';

// jsdom has no real ResizeObserver — needed by Overlay's own positioning
// hook, same stub `NoteEmbedMoreActions.integration.test.tsx` already
// establishes for exactly this gap.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  );
});

afterEach(() => {
  cleanup();
});

function openFencedCodeMenu() {
  const button = document.querySelector<HTMLButtonElement>('.cm-code-block-actions')!;
  fireEvent.mouseDown(button);
  fireEvent.click(button);
}

/** Opens the Actions menu and enters the language-selector view (a content swap within the same Overlay, not a nested submenu — see `FencedCodeActionsMenu.tsx`'s own doc comment). */
function openChangeLanguageSubmenu() {
  openFencedCodeMenu();
  fireEvent.click(screen.getByText('Change Language'));
}

function menuItemFor(label: string): HTMLElement {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (el) => el.textContent === label
  )!;
}

describe('Fenced code "More actions" — Change Language', () => {
  it('lists every registered language, including JSX and TSX as their own selectable entries', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```js', 'const x = 1;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();

    const labels = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(
      (el) => el.textContent
    );
    expect(labels).toEqual(
      expect.arrayContaining(['JavaScript', 'JSX', 'TypeScript', 'TSX', 'JSON', 'CSS', 'HTML', 'Python'])
    );
  });

  it('also lists the first expansion batch (YAML, XML, SQL, Shell, C, C++, Java, Go, Rust) — menu listing needs no loaded parser', () => {
    // The submenu is built purely from registry metadata
    // (`fencedCodeLanguageDescriptions.map(...)`) — it must list every
    // lazy entry exactly like the eager ones, without triggering or
    // waiting on `.load()` for any of them.
    render(<MarkdownEditor pageId="test-page" markdown={['```js', 'const x = 1;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();

    const labels = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(
      (el) => el.textContent
    );
    expect(labels).toEqual(
      expect.arrayContaining(['YAML', 'XML', 'SQL', 'Shell', 'C', 'C++', 'Java', 'Go', 'Rust'])
    );
  });

  it('a `rust` fence shows Rust as the checked entry, and selecting Go rewrites the fence to `go`', () => {
    const onEdit = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={['```rust', 'fn main() {}', '```'].join('\n')}
        onEdit={onEdit}
      />
    );
    openChangeLanguageSubmenu();

    expect(menuItemFor('Rust').classList.contains('entry-selected')).toBe(true);

    fireEvent.click(menuItemFor('Go'));

    expect(onEdit).toHaveBeenCalledWith(['```go', 'fn main() {}', '```'].join('\n'));
  });

  it('a fence manually written as `jsx` shows JSX (not JavaScript) as the checked entry', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```jsx', 'const x = <div />;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();

    expect(menuItemFor('JSX').classList.contains('entry-selected')).toBe(true);
    expect(menuItemFor('JavaScript').classList.contains('entry-selected')).toBe(false);
  });

  it('a fence manually written as `tsx` shows TSX (not TypeScript) as the checked entry', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```tsx', 'const x = <div />;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();

    expect(menuItemFor('TSX').classList.contains('entry-selected')).toBe(true);
    expect(menuItemFor('TypeScript').classList.contains('entry-selected')).toBe(false);
  });

  it('re-selecting the already-checked JSX entry keeps the fence as `jsx` — no silent rewrite to `javascript`', () => {
    const onEdit = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={['```jsx', 'const x = <div />;', '```'].join('\n')}
        onEdit={onEdit}
      />
    );
    openChangeLanguageSubmenu();

    fireEvent.click(menuItemFor('JSX'));

    expect(onEdit).toHaveBeenCalledWith(['```jsx', 'const x = <div />;', '```'].join('\n'));
  });

  it('selecting JSX from a plain `js` block rewrites the fence to `jsx`', () => {
    const onEdit = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={['```js', 'const x = 1;', '```'].join('\n')}
        onEdit={onEdit}
      />
    );
    openChangeLanguageSubmenu();

    fireEvent.click(menuItemFor('JSX'));

    expect(onEdit).toHaveBeenCalledWith(['```jsx', 'const x = 1;', '```'].join('\n'));
  });

  it('selecting TSX from a plain `ts` block rewrites the fence to `tsx`', () => {
    const onEdit = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={['```ts', 'const x: number = 1;', '```'].join('\n')}
        onEdit={onEdit}
      />
    );
    openChangeLanguageSubmenu();

    fireEvent.click(menuItemFor('TSX'));

    expect(onEdit).toHaveBeenCalledWith(['```tsx', 'const x: number = 1;', '```'].join('\n'));
  });

  it('selecting JavaScript from a `jsx` block rewrites the fence to plain `javascript`', () => {
    const onEdit = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={['```jsx', 'const x = <div />;', '```'].join('\n')}
        onEdit={onEdit}
      />
    );
    openChangeLanguageSubmenu();

    fireEvent.click(menuItemFor('JavaScript'));

    expect(onEdit).toHaveBeenCalledWith(['```javascript', 'const x = <div />;', '```'].join('\n'));
  });
});

describe('Fenced code "More actions" — Change Language is a view swap, not a nested submenu/overlay', () => {
  it('the initial Actions menu shows Change Language, Format code, Download code, and Remove, with no language list yet', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```js', 'const x = 1;', '```'].join('\n')} />);
    openFencedCodeMenu();

    const labels = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(
      (el) => el.textContent
    );
    expect(labels).toEqual(['Change Language', 'Format code', 'Download code', 'Remove']);
  });

  it('Format code is omitted for a language codeFormatting.ts has no Prettier parser for (Python)', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```py', 'x = 1', '```'].join('\n')} />);
    openFencedCodeMenu();

    const labels = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(
      (el) => el.textContent
    );
    expect(labels).toEqual(['Change Language', 'Download code', 'Remove']);
  });

  it('entering the language view replaces the Actions menu content in place — exactly one open overlay surface, not two', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```js', 'const x = 1;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();

    expect(screen.queryByText('Remove')).toBeNull();
    expect(document.querySelectorAll('.overlay').length).toBe(1);
  });

  it('search receives focus automatically on entering the language view', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```js', 'const x = 1;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();

    expect(document.activeElement).toBe(screen.getByPlaceholderText('Search languages'));
  });

  it('opening the picker with TypeScript selected highlights TypeScript, not JavaScript', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```ts', 'const x: number = 1;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();

    expect(screen.getByPlaceholderText('Search languages').getAttribute('aria-activedescendant')).toBe(
      'TypeScript'
    );
    expect(menuItemFor('TypeScript').classList.contains('entry-force-hover')).toBe(true);
    expect(menuItemFor('JavaScript').classList.contains('entry-force-hover')).toBe(false);
  });

  it('searching away from the selected language falls back to the first filtered result', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```ts', 'const x: number = 1;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();
    expect(screen.getByPlaceholderText('Search languages').getAttribute('aria-activedescendant')).toBe(
      'TypeScript'
    );

    // "ja" matches JavaScript/JSX but not TypeScript (its own alias list
    // has no substring overlap with "ja") -- TypeScript drops out of the
    // filtered results entirely.
    fireEvent.change(screen.getByPlaceholderText('Search languages'), { target: { value: 'ja' } });

    expect(screen.getByPlaceholderText('Search languages').getAttribute('aria-activedescendant')).toBe(
      'JavaScript'
    );
  });

  it('clearing the search restores the selected language as the active item', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```ts', 'const x: number = 1;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();

    fireEvent.change(screen.getByPlaceholderText('Search languages'), { target: { value: 'ja' } });
    expect(screen.getByPlaceholderText('Search languages').getAttribute('aria-activedescendant')).toBe(
      'JavaScript'
    );

    fireEvent.change(screen.getByPlaceholderText('Search languages'), { target: { value: '' } });

    expect(screen.getByPlaceholderText('Search languages').getAttribute('aria-activedescendant')).toBe(
      'TypeScript'
    );
  });

  it('a query matching nothing clears the active item entirely', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```ts', 'const x: number = 1;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();

    fireEvent.change(screen.getByPlaceholderText('Search languages'), {
      target: { value: 'not-a-real-language' },
    });

    expect(
      screen.getByPlaceholderText('Search languages').getAttribute('aria-activedescendant')
    ).toBeNull();
  });

  it('keyboard navigation continues to work normally after opening on a selected language', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```ts', 'const x: number = 1;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();
    expect(screen.getByPlaceholderText('Search languages').getAttribute('aria-activedescendant')).toBe(
      'TypeScript'
    );

    fireEvent.keyDown(screen.getByPlaceholderText('Search languages'), { key: 'ArrowDown' });

    // TypeScript -> TSX, the next row in registry order.
    expect(screen.getByPlaceholderText('Search languages').getAttribute('aria-activedescendant')).toBe(
      'TSX'
    );
  });

  it('has exactly one back-navigation control, in the language view\'s own header, not a separate control in the Actions view', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```js', 'const x = 1;', '```'].join('\n')} />);
    openFencedCodeMenu();
    expect(screen.queryByLabelText('Back to actions')).toBeNull();

    fireEvent.click(screen.getByText('Change Language'));
    expect(screen.queryByLabelText('Back to actions')).not.toBeNull();
  });

  it('the Actions view\'s Change Language row shows a trailing affordance chevron', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```js', 'const x = 1;', '```'].join('\n')} />);
    openFencedCodeMenu();

    const row = menuItemFor('Change Language');
    expect(row.querySelector('.entry__trailing')).not.toBeNull();
  });

  it('the language view\'s header button returns to the Actions view — it does not close the whole menu', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```js', 'const x = 1;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();

    fireEvent.click(screen.getByLabelText('Back to actions'));

    expect(screen.queryByText('Remove')).not.toBeNull();
    expect(screen.queryByPlaceholderText('Search languages')).toBeNull();
    expect(document.querySelector('.cm-code-block-actions')?.getAttribute('aria-expanded')).toBe(
      'true'
    );
  });

  it('Escape from the language view closes the whole menu directly — no intermediate back state', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```js', 'const x = 1;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByText('Change Language')).toBeNull();
    expect(screen.queryByPlaceholderText('Search languages')).toBeNull();
    expect(document.querySelector('.cm-code-block-actions')?.getAttribute('aria-expanded')).toBe(
      'false'
    );
  });

  it('reopening the menu after a prior Change-Language visit starts back on the Actions view with no leftover search text', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```js', 'const x = 1;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();
    fireEvent.change(screen.getByPlaceholderText('Search languages'), { target: { value: 'py' } });
    fireEvent.keyDown(document, { key: 'Escape' }); // full close, no back step

    openFencedCodeMenu();

    expect(screen.queryByText('Remove')).not.toBeNull();
    expect(screen.queryByPlaceholderText('Search languages')).toBeNull();
  });

  it('selecting a language still applies it and closes the whole menu, same as before', () => {
    const onEdit = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={['```js', 'const x = 1;', '```'].join('\n')}
        onEdit={onEdit}
      />
    );
    openChangeLanguageSubmenu();

    fireEvent.click(menuItemFor('Python'));

    expect(onEdit).toHaveBeenCalledWith(['```python', 'const x = 1;', '```'].join('\n'));
    expect(screen.queryByPlaceholderText('Search languages')).toBeNull();
  });
});

describe('Fenced code "More actions" — language search', () => {
  function search(query: string) {
    fireEvent.change(screen.getByPlaceholderText('Search languages'), { target: { value: query } });
  }

  it('is case-insensitive and searches the registry\'s own alias list, not a separate hardcoded search index', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```js', 'const x = 1;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();

    search('JS');

    const labels = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(
      (el) => el.textContent
    );
    // 'js' is JavaScript's own alias, and a substring of JSX's own 'jsx'
    // alias — both come from the registry's existing alias arrays, not a
    // second list this search feature introduces.
    expect(labels).toEqual(expect.arrayContaining(['JavaScript', 'JSX']));
    expect(labels).not.toContain('Python');
  });

  it('"py" finds Python only', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```js', 'const x = 1;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();

    search('py');

    const labels = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(
      (el) => el.textContent
    );
    expect(labels).toEqual(['Python']);
  });

  it('"c" finds every C-family language currently registered (C, C++) via their own aliases', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```js', 'const x = 1;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();

    search('c');

    const labels = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(
      (el) => el.textContent
    );
    expect(labels).toEqual(expect.arrayContaining(['C', 'C++']));
  });

  it('a query matching nothing shows the empty state, not a stale or crashed list', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```js', 'const x = 1;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();

    search('not-a-real-language');

    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(0);
    expect(screen.queryByText('No matching languages')).not.toBeNull();
  });

  it('the currently selected language still shows its checked state when it matches the search', () => {
    render(
      <MarkdownEditor pageId="test-page" markdown={['```py', 'x = 1', '```'].join('\n')} />
    );
    openChangeLanguageSubmenu();

    search('py');

    expect(menuItemFor('Python').classList.contains('entry-selected')).toBe(true);
  });

  it('clearing the search restores the full list', () => {
    render(<MarkdownEditor pageId="test-page" markdown={['```js', 'const x = 1;', '```'].join('\n')} />);
    openChangeLanguageSubmenu();

    search('py');
    search('');

    const labels = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(
      (el) => el.textContent
    );
    expect(labels.length).toBeGreaterThanOrEqual(17);
  });
});
