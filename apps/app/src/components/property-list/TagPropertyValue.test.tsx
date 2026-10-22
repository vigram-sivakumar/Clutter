// @vitest-environment jsdom

import { act, useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PropertyList } from './PropertyList';
import { TagPropertyValue, parseTagInput } from './TagPropertyValue';
import { writeShowTagEmojis } from '@shared/helpers/showTagEmojisPreference';

// Overlay (the suggestion popover) positions itself with a ResizeObserver,
// which jsdom lacks — same local stub as Overlay.test.tsx.
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
});

function getInput(): HTMLInputElement {
  return screen.getByRole('textbox', { name: 'Tags' }) as HTMLInputElement;
}

function pillLabels(container: HTMLElement = document.body): string[] {
  // A pill's text (the `#` prefix, then the name) lives in its `.pill__label`.
  return [...container.querySelectorAll('.pill .pill__label')].map(
    (label) => label.firstChild!.textContent! + label.childNodes[1]!.textContent!
  );
}

function type(text: string) {
  fireEvent.change(getInput(), { target: { value: text } });
}

function press(key: string) {
  return fireEvent.keyDown(getInput(), { key });
}

function isShaking(): boolean {
  return document.querySelector('.pill-list-editor')!.classList.contains('editable-text--shake');
}

function StatefulTags({ initial }: { initial: string[] }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <TagPropertyValue name="Tags" value={value} editable onCommit={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

function storedValue(): string[] {
  return JSON.parse(screen.getByTestId('value').textContent!) as string[];
}

describe('parseTagInput', () => {
  it('reads a name with or without a leading #, per the editor tag grammar', () => {
    expect(parseTagInput('#design')).toBe('design');
    expect(parseTagInput('design')).toBe('design');
    expect(parseTagInput('  #product-design  ')).toBe('product-design');
    // Hyphens are the canonical separator: an underscore is written as one.
    expect(parseTagInput('#v2_ui')).toBe('v2-ui');
  });

  it('writes spaces as - (the canonical separator), like the sidebar rename', () => {
    expect(parseTagInput('Testing new tag')).toBe('Testing-new-tag');
    expect(parseTagInput('  #product   design ')).toBe('product-design');
    expect(parseTagInput('# spaced')).toBe('spaced');
  });

  it('rejects empty, bare #, and names with characters a tag cannot hold', () => {
    expect(parseTagInput('')).toBeNull();
    expect(parseTagInput('   ')).toBeNull();
    expect(parseTagInput('#')).toBeNull();
    expect(parseTagInput('#a.b')).toBeNull();
    expect(parseTagInput('#a b.c')).toBeNull();
    expect(parseTagInput('##design')).toBeNull();
  });
});

describe('TagPropertyValue — read-only, dismissable', () => {
  it('with onRemoveValue, each pill has a dismiss button removing that tag — and no input', () => {
    const onRemoveValue = vi.fn();
    render(<TagPropertyValue name="Tags" value={['design', 'product']} editable={false} onRemoveValue={onRemoveValue} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove tag product' }));

    expect(onRemoveValue).toHaveBeenCalledExactlyOnceWith(1, 'product');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('without it, read-only pills have no dismiss button', () => {
    render(<TagPropertyValue name="Tags" value={['design']} editable={false} />);
    expect(screen.queryByRole('button', { name: 'Remove tag design' })).toBeNull();
  });
});

describe('TagPropertyValue — read-only', () => {
  it('renders each tag as a # pill, with no input and no dismiss buttons', () => {
    render(<TagPropertyValue name="Tags" value={['design', 'product-ui']} editable={false} />);

    expect(pillLabels()).toEqual(['#design', '#product ui']);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('TagPropertyValue — editable', () => {
  it('renders the existing tags as pills plus an input', () => {
    render(<StatefulTags initial={['design', 'product']} />);

    expect(pillLabels()).toEqual(['#design', '#product']);
    expect(getInput()).toBeTruthy();
    expect(getInput().placeholder).toBe('');
  });

  it('shows the "Empty" placeholder only when there are no tags', () => {
    render(<StatefulTags initial={[]} />);

    expect(getInput().placeholder).toBe('Empty');
  });

  it('focuses the input when the value area is clicked', () => {
    render(<StatefulTags initial={['design']} />);

    fireEvent.click(document.querySelector('.pill-list-editor')!);

    expect(document.activeElement).toBe(getInput());
  });

  it('dismisses a tag via its pill button, without focusing the input', () => {
    render(<StatefulTags initial={['design', 'product', 'ui']} />);

    const productPill = [...document.querySelectorAll<HTMLElement>('.pill')][1]!;
    fireEvent.click(within(productPill).getByRole('button', { name: 'Remove tag product' }));

    expect(storedValue()).toEqual(['design', 'ui']);
    expect(pillLabels()).toEqual(['#design', '#ui']);
    expect(document.activeElement).not.toBe(getInput());
  });

  it('turns a typed #tag into a pill on Enter, and clears the input', () => {
    render(<StatefulTags initial={[]} />);

    act(() => getInput().focus());
    type('#design');
    const notCancelled = press('Enter');

    expect(notCancelled).toBe(false);
    expect(storedValue()).toEqual(['design']);
    expect(pillLabels()).toEqual(['#design']);
    expect(getInput().value).toBe('');
    expect(document.activeElement).toBe(getInput());
  });

  it('Space does not commit: the text stays in the input, nothing is added, and Space is left to the input', () => {
    const onCommit = vi.fn();
    render(<TagPropertyValue name="Tags" value={[]} editable onCommit={onCommit} />);

    type('design');
    const notCancelled = press(' ');

    expect(notCancelled).toBe(true); // not intercepted: the input's own Space handling
    expect(onCommit).not.toHaveBeenCalled();
    expect(getInput().value).toBe('design');
    expect(isShaking()).toBe(false);

    press('Enter');
    expect(onCommit).toHaveBeenCalledWith(['design']);
  });

  it('a draft containing spaces commits as a tag with `-` for each run of spaces, as the sidebar rename does', () => {
    const onCommit = vi.fn();
    render(<TagPropertyValue name="Tags" value={[]} editable onCommit={onCommit} />);

    type('Testing new tag');
    press(' ');
    expect(onCommit).not.toHaveBeenCalled();
    press('Enter');

    expect(onCommit).toHaveBeenCalledWith(['Testing-new-tag']);
    expect(isShaking()).toBe(false);
  });

  it('Enter on an empty input adds nothing and does not shake', () => {
    const onCommit = vi.fn();
    render(<TagPropertyValue name="Tags" value={[]} editable onCommit={onCommit} />);

    press('Enter');

    expect(onCommit).not.toHaveBeenCalled();
    expect(isShaking()).toBe(false);
  });

  it('also accepts a tag typed without #', () => {
    render(<StatefulTags initial={[]} />);

    type('product');
    press('Enter');

    expect(storedValue()).toEqual(['product']);
  });

  it('adds several tags in one session, keeping the existing pills', () => {
    render(<StatefulTags initial={['design']} />);

    type('#ui');
    press('Enter');
    type('#product');
    press('Enter');
    type('#research');
    press('Enter');

    expect(storedValue()).toEqual(['design', 'ui', 'product', 'research']);
  });

  it('does not add a duplicate, by the tag identity rule (case and -/_)', () => {
    const onCommit = vi.fn();
    render(
      <TagPropertyValue name="Tags" value={['Design', 'product-ui']} editable onCommit={onCommit} />
    );

    for (const text of ['#design', '#DESIGN', '#product_ui', '#Product-UI']) {
      type(text);
      press('Enter');
      expect(getInput().value).toBe('');
    }

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('never makes a pill from empty or whitespace-only input', () => {
    const onCommit = vi.fn();
    render(<TagPropertyValue name="Tags" value={[]} editable onCommit={onCommit} />);

    expect(press('Enter')).toBe(false);
    type('   ');
    press('Enter');
    type('#');
    press('Enter');

    expect(onCommit).not.toHaveBeenCalled();
    expect(isShaking()).toBe(true);
  });

  it('rejects an invalid tag with the shared shake, keeping the text', () => {
    const onCommit = vi.fn();
    render(<TagPropertyValue name="Tags" value={[]} editable onCommit={onCommit} />);

    type('#a.b');
    press('Enter');

    expect(isShaking()).toBe(true);
    expect(getInput().value).toBe('#a.b');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Backspace in an empty input removes the last pill', () => {
    render(<StatefulTags initial={['design', 'product']} />);

    press('Backspace');
    expect(storedValue()).toEqual(['design']);

    type('#u');
    press('Backspace');
    expect(storedValue()).toEqual(['design']);
  });

  it('leaving the field adds a valid pending tag and discards an invalid one', () => {
    render(<StatefulTags initial={['design']} />);

    act(() => getInput().focus());
    type('#ui');
    act(() => getInput().blur());
    expect(storedValue()).toEqual(['design', 'ui']);

    act(() => getInput().focus());
    type('#not.valid');
    act(() => getInput().blur());
    expect(storedValue()).toEqual(['design', 'ui']);
    expect(getInput().value).toBe('');
  });
});

describe('TagPropertyValue — autocomplete', () => {
  /** A stand-in for createTagSuggester: case-insensitive substring over vault tags, display labels. */
  const VAULT_TAGS = ['product', 'prototype', 'product-design', 'design', 'research'];
  const getSuggestions = (query: string) =>
    VAULT_TAGS.filter((tag) => tag.replace(/-/g, ' ').includes(query.toLowerCase()))
      .map((tag) => tag.replace(/-/g, ' '))
      .sort();

  function SuggestingTags({ initial }: { initial: string[] }) {
    const [value, setValue] = useState(initial);
    return (
      <>
        <TagPropertyValue
          name="Tags"
          value={value}
          editable
          getSuggestions={getSuggestions}
          onCommit={setValue}
        />
        <output data-testid="value">{JSON.stringify(value)}</output>
      </>
    );
  }

  function suggestionLabels(): string[] {
    return [...document.querySelectorAll('.pill-list-editor__suggestions [role="menuitem"]')].map(
      (row) => row.textContent!
    );
  }

  function activeSuggestion(): string | null {
    const id = getInput().getAttribute('aria-activedescendant');
    return id ? document.getElementById(id)!.textContent : null;
  }

  it('shows matching existing tags in a menu while typing, with nothing highlighted', () => {
    render(<SuggestingTags initial={[]} />);

    act(() => getInput().focus());
    type('#pro');

    expect(suggestionLabels()).toEqual(['#product', '#product design', '#prototype']);
    expect(document.querySelector('.pill-list-editor__suggestions')!.classList.contains('menu')).toBe(true);
    expect(activeSuggestion()).toBeNull();
  });

  it('excludes tags already on the property', () => {
    render(<SuggestingTags initial={['product']} />);

    act(() => getInput().focus());
    type('#prod');

    expect(suggestionLabels()).toEqual(['#product design']);
  });

  it('lists every tag when the focused field is empty (or only `#`), and narrows as text is typed', () => {
    render(<SuggestingTags initial={[]} />);

    act(() => getInput().focus());
    expect(suggestionLabels()).toEqual(['#design', '#product', '#product design', '#prototype', '#research']);

    type('#');
    expect(suggestionLabels()).toEqual(['#design', '#product', '#product design', '#prototype', '#research']);

    type('#pro');
    expect(suggestionLabels()).toEqual(['#product', '#product design', '#prototype']);
  });

  it('leaves out tags the property already holds, even with nothing typed', () => {
    render(<SuggestingTags initial={['design', 'research']} />);

    act(() => getInput().focus());

    expect(suggestionLabels()).toEqual(['#product', '#product design', '#prototype']);
  });

  it('shows no menu when nothing matches', () => {
    render(<SuggestingTags initial={[]} />);

    act(() => getInput().focus());
    type('#zzz');

    expect(suggestionLabels()).toEqual([]);
  });

  it('clicking a suggestion adds it as a pill (label serialized back to the tag name)', () => {
    render(<SuggestingTags initial={['design']} />);

    act(() => getInput().focus());
    type('#prod');
    fireEvent.click(screen.getByRole('menuitem', { name: '#product design' }));

    expect(storedValue()).toEqual(['design', 'product-design']);
    expect(getInput().value).toBe('');
    // The field is still focused and now empty: it offers the remaining tags again, minus the two it holds.
    expect(suggestionLabels()).toEqual(['#product', '#prototype', '#research']);
  });

  it('Enter adds the highlighted suggestion; ArrowDown moves the highlight', () => {
    render(<SuggestingTags initial={[]} />);

    act(() => getInput().focus());
    type('#pro');
    press('ArrowDown');
    expect(activeSuggestion()).toBe('#product');
    press('ArrowDown');
    expect(activeSuggestion()).toBe('#product design');

    press('Enter');
    expect(storedValue()).toEqual(['product-design']);
  });

  it('with nothing highlighted, Enter adds the typed text', () => {
    render(<SuggestingTags initial={[]} />);

    act(() => getInput().focus());
    type('#pro');
    press('Enter');

    expect(storedValue()).toEqual(['pro']);
  });

  it('clears the highlight when the typed text changes', () => {
    render(<SuggestingTags initial={[]} />);

    act(() => getInput().focus());
    type('#pro');
    press('ArrowDown');
    expect(activeSuggestion()).toBe('#product');

    type('#prod');
    expect(activeSuggestion()).toBeNull();
  });

  it('Enter adds exactly what was typed — a new tag when nothing matches', () => {
    render(<SuggestingTags initial={[]} />);

    act(() => getInput().focus());
    type('#newtag');
    press('Enter');
    expect(storedValue()).toEqual(['newtag']);

    type('#pro');
    press('Enter');
    expect(storedValue()).toEqual(['newtag', 'pro']);
  });

  it('never adds a duplicate through a suggestion', () => {
    const onCommit = vi.fn();
    render(
      <TagPropertyValue
        name="Tags"
        value={['Product']}
        editable
        getSuggestions={getSuggestions}
        onCommit={onCommit}
      />
    );

    act(() => getInput().focus());
    type('#product');

    expect(suggestionLabels()).toEqual(['#product design']);
    press('Enter');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Escape closes the menu until typing resumes', () => {
    render(<SuggestingTags initial={[]} />);

    act(() => getInput().focus());
    type('#pro');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(suggestionLabels()).toEqual([]);

    type('#prot');
    expect(suggestionLabels()).toEqual(['#prototype']);
  });

  it('closes the menu when the input loses focus', () => {
    render(<SuggestingTags initial={[]} />);

    act(() => getInput().focus());
    type('#pro');
    act(() => getInput().blur());

    expect(getInput().getAttribute('aria-expanded')).toBe('false');
  });

  it('leaving an empty, focused field closes the list for good: focus is not handed back to reopen it', () => {
    render(<SuggestingTags initial={[]} />);

    act(() => getInput().focus());
    expect(suggestionLabels().length).toBeGreaterThan(0);
    act(() => getInput().blur());

    expect(getInput().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).not.toBe(getInput());
  });
});

describe('TagPropertyValue — opening a tag', () => {
  function pill(name: string): HTMLElement {
    return screen.getByRole('button', { name: `Open tag ${name}` });
  }

  it('clicking an editable pill opens its Tag Collection — no edit, no focus, no change', () => {
    const onOpenTag = vi.fn();
    const onCommit = vi.fn();
    render(
      <TagPropertyValue
        name="Tags"
        value={['design', 'product']}
        editable
        onOpenTag={onOpenTag}
        onCommit={onCommit}
      />
    );

    fireEvent.click(pill('product'));

    expect(onOpenTag).toHaveBeenCalledExactlyOnceWith('product');
    expect(onCommit).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(getInput());
  });

  it('clicking a read-only pill (like the frontmatter Tags) opens its Tag Collection', () => {
    const onOpenTag = vi.fn();
    render(
      <TagPropertyValue name="Tags" value={['design']} editable={false} onOpenTag={onOpenTag} />
    );

    fireEvent.click(pill('design'));

    expect(onOpenTag).toHaveBeenCalledExactlyOnceWith('design');
  });

  it('Enter or Space on a focused pill opens it', () => {
    const onOpenTag = vi.fn();
    render(
      <TagPropertyValue name="Tags" value={['design']} editable={false} onOpenTag={onOpenTag} />
    );

    fireEvent.keyDown(pill('design'), { key: 'Enter' });
    fireEvent.keyDown(pill('design'), { key: ' ' });

    expect(onOpenTag).toHaveBeenCalledTimes(2);
  });

  it('the dismiss button removes the tag and does not open it', () => {
    const onOpenTag = vi.fn();
    render(<StatefulTagsWithOpen initial={['design', 'product']} onOpenTag={onOpenTag} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove tag product' }));

    expect(storedValue()).toEqual(['design']);
    expect(onOpenTag).not.toHaveBeenCalled();
  });

  it('pills are plain (not buttons) when no onOpenTag is supplied', () => {
    render(<TagPropertyValue name="Tags" value={['design']} editable={false} />);

    expect(screen.queryByRole('button', { name: 'Open tag design' })).toBeNull();
  });
});

function StatefulTagsWithOpen({
  initial,
  onOpenTag,
}: {
  initial: string[];
  onOpenTag(name: string): void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <TagPropertyValue
        name="Tags"
        value={value}
        editable
        onOpenTag={onOpenTag}
        onCommit={setValue}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

describe('PropertyList tag Property', () => {
  it('renders a read-only tag Property (like Tags) as pills', () => {
    render(
      <PropertyList items={[{ name: 'Tags', type: 'tag', value: ['design'], editable: false }]} />
    );

    expect(pillLabels()).toEqual(['#design']);
  });
});

describe('TagPropertyValue — a tag with an assigned emoji', () => {
  const ICONS: Record<string, string> = { design: '📦' };
  const getTagIcon = (name: string) => ICONS[name];

  function renderTags(props: { editable: boolean; onOpenTag?: (name: string) => void }) {
    return render(
      props.editable ? (
        <TagPropertyValue name="Tags" value={['design', 'plain']} editable onCommit={vi.fn()} onOpenTag={props.onOpenTag} getTagIcon={getTagIcon} />
      ) : (
        <TagPropertyValue name="Tags" value={['design', 'plain']} editable={false} onOpenTag={props.onOpenTag} getTagIcon={getTagIcon} />
      )
    );
  }

  const pillOf = (text: string) =>
    [...document.querySelectorAll<HTMLElement>('.pill')].find((pill) => pill.textContent!.includes(text))!;

  it.each([true, false])('shows the emoji in place of the `#`, as plain text and not an icon (editable: %s)', (editable) => {
    renderTags({ editable });
    const pill = pillOf('design');
    const prefix = pill.querySelector('.pill__label .pill__prefix')!;

    expect(prefix.textContent).toBe('📦');
    expect(prefix.classList.contains('pill__prefix--emoji')).toBe(true);
    expect(pill.textContent).not.toContain('#');
    expect(pill.querySelector('.pill__label .app-icon, .pill__label .emoji-icon, .pill__label svg')).toBeNull();
    expect(pillLabels()[0]).toBe('📦design');
  });

  it.each([true, false])('keeps the `#` for a tag without an emoji (editable: %s)', (editable) => {
    renderTags({ editable });
    const prefix = pillOf('plain').querySelector('.pill__label .pill__prefix')!;

    expect(prefix.textContent).toBe('#');
    expect(prefix.classList.contains('pill__prefix--emoji')).toBe(false);
  });

  it('still opens the tag on click, with or without an emoji', () => {
    const onOpenTag = vi.fn();
    renderTags({ editable: false, onOpenTag });

    fireEvent.click(screen.getByRole('button', { name: 'Open tag design' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open tag plain' }));

    expect(onOpenTag.mock.calls.map((call) => call[0])).toEqual(['design', 'plain']);
  });

  it('still dismisses a tag with an emoji (read-only, onRemoveValue)', () => {
    const onRemoveValue = vi.fn();
    render(<TagPropertyValue name="Tags" value={['design']} editable={false} getTagIcon={getTagIcon} onRemoveValue={onRemoveValue} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove tag design' }));

    expect(onRemoveValue).toHaveBeenCalledWith(0, 'design');
  });

  it('leaves the autocomplete rows alone: they keep the dimmed `#`', () => {
    function Suggesting() {
      const [value, setValue] = useState<string[]>([]);
      return (
        <TagPropertyValue name="Tags" value={value} editable onCommit={setValue} getTagIcon={getTagIcon} getSuggestions={() => ['design']} />
      );
    }
    render(<Suggesting />);

    act(() => getInput().focus());
    fireEvent.change(getInput(), { target: { value: 'des' } });

    const row = document.querySelector('.pill-list-editor__suggestions [role="menuitem"]')!;
    expect(row.textContent).toBe('#design');
  });
});

describe('TagPropertyValue — the Show tag emojis setting', () => {
  const getTagIcon = (name: string) => (name === 'design' ? '📦' : undefined);
  afterEach(() => localStorage.clear());

  const pillOf = (text: string) =>
    [...document.querySelectorAll<HTMLElement>('.pill')].find((pill) => pill.textContent!.includes(text))!;
  const prefixOf = (text: string) => pillOf(text).querySelector('.pill__label .pill__prefix')!;
  const tags = (editable: boolean) =>
    editable ? (
      <TagPropertyValue name="Tags" value={['design', 'plain']} editable onCommit={vi.fn()} getTagIcon={getTagIcon} />
    ) : (
      <TagPropertyValue name="Tags" value={['design', 'plain']} editable={false} getTagIcon={getTagIcon} />
    );

  it.each([true, false])('is on by default: the emoji replaces the `#` (editable: %s)', (editable) => {
    render(tags(editable));

    expect(prefixOf('design').textContent).toBe('📦');
    expect(prefixOf('design').classList.contains('pill__prefix--emoji')).toBe(true);
  });

  it.each([true, false])('off: the tag keeps `# name`, with no emoji and no emoji styling or space (editable: %s)', (editable) => {
    writeShowTagEmojis(false);
    render(tags(editable));

    expect(prefixOf('design').textContent).toBe('#');
    expect(prefixOf('design').classList.contains('pill__prefix--emoji')).toBe(false);
    expect(pillOf('design').textContent).not.toContain('📦');
    expect(pillLabels()).toEqual(['#design', '#plain']);
  });

  it.each([true, false])('a tag without an emoji looks the same in both modes (editable: %s)', (editable) => {
    const { unmount } = render(tags(editable));
    const on = pillOf('plain').outerHTML;
    unmount();

    writeShowTagEmojis(false);
    render(tags(editable));

    expect(pillOf('plain').outerHTML).toBe(on);
    expect(prefixOf('plain').textContent).toBe('#');
  });

  it.each([true, false])('changing the setting updates an open editor at once, both ways, without a re-mount (editable: %s)', (editable) => {
    render(tags(editable));
    expect(prefixOf('design').textContent).toBe('📦');

    act(() => writeShowTagEmojis(false));
    expect(prefixOf('design').textContent).toBe('#');

    act(() => writeShowTagEmojis(true));
    expect(prefixOf('design').textContent).toBe('📦');
  });

  it('hiding the emoji changes nothing else: the tag still opens and dismisses', () => {
    writeShowTagEmojis(false);
    const onOpenTag = vi.fn();
    const onRemoveValue = vi.fn();
    render(
      <TagPropertyValue name="Tags" value={['design']} editable={false} getTagIcon={getTagIcon} onOpenTag={onOpenTag} onRemoveValue={onRemoveValue} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open tag design' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag design' }));

    expect(onOpenTag).toHaveBeenCalledWith('design');
    expect(onRemoveValue).toHaveBeenCalledWith(0, 'design');
  });
});
