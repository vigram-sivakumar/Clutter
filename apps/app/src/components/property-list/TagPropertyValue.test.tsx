// @vitest-environment jsdom

import { act, useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PropertyList } from './PropertyList';
import { TagPropertyValue, parseTagInput } from './TagPropertyValue';

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
  return [...container.querySelectorAll('.pill')].map(
    (pill) => pill.firstChild!.textContent! + pill.childNodes[1]!.textContent!
  );
}

function type(text: string) {
  fireEvent.change(getInput(), { target: { value: text } });
}

function press(key: string) {
  return fireEvent.keyDown(getInput(), { key });
}

function isShaking(): boolean {
  return document.querySelector('.property-list__tag-editor')!.classList.contains('editable-text--shake');
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
    expect(parseTagInput('#v2_ui')).toBe('v2_ui');
  });

  it('rejects empty, bare #, and names with characters a tag cannot hold', () => {
    expect(parseTagInput('')).toBeNull();
    expect(parseTagInput('   ')).toBeNull();
    expect(parseTagInput('#')).toBeNull();
    expect(parseTagInput('#a.b')).toBeNull();
    expect(parseTagInput('#two words')).toBeNull();
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

    fireEvent.click(document.querySelector('.property-list__tag-editor')!);

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

  it('turns a typed #tag into a pill on Space, and clears the input', () => {
    render(<StatefulTags initial={[]} />);

    act(() => getInput().focus());
    type('#design');
    const notCancelled = press(' ');

    expect(notCancelled).toBe(false);
    expect(storedValue()).toEqual(['design']);
    expect(pillLabels()).toEqual(['#design']);
    expect(getInput().value).toBe('');
    expect(document.activeElement).toBe(getInput());
  });

  it('also accepts a tag typed without # and committed with Enter', () => {
    render(<StatefulTags initial={[]} />);

    type('product');
    press('Enter');

    expect(storedValue()).toEqual(['product']);
  });

  it('adds several tags in one session, keeping the existing pills', () => {
    render(<StatefulTags initial={['design']} />);

    type('#ui');
    press(' ');
    type('#product');
    press(' ');
    type('#research');
    press(' ');

    expect(storedValue()).toEqual(['design', 'ui', 'product', 'research']);
  });

  it('does not add a duplicate, by the tag identity rule (case and -/_)', () => {
    const onCommit = vi.fn();
    render(
      <TagPropertyValue name="Tags" value={['Design', 'product-ui']} editable onCommit={onCommit} />
    );

    for (const text of ['#design', '#DESIGN', '#product_ui', '#Product-UI']) {
      type(text);
      press(' ');
      expect(getInput().value).toBe('');
    }

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('never makes a pill from empty or whitespace-only input, and Space types nothing', () => {
    const onCommit = vi.fn();
    render(<TagPropertyValue name="Tags" value={[]} editable onCommit={onCommit} />);

    expect(press(' ')).toBe(false);
    type('   ');
    press(' ');
    type('#');
    press(' ');

    expect(onCommit).not.toHaveBeenCalled();
    expect(isShaking()).toBe(true);
  });

  it('rejects an invalid tag with the shared shake, keeping the text', () => {
    const onCommit = vi.fn();
    render(<TagPropertyValue name="Tags" value={[]} editable onCommit={onCommit} />);

    type('#a.b');
    press(' ');

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
    type('#not valid');
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
    return [...document.querySelectorAll('.property-list__tag-suggestions [role="menuitem"]')].map(
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
    expect(document.querySelector('.property-list__tag-suggestions')!.classList.contains('menu')).toBe(true);
    expect(activeSuggestion()).toBeNull();
  });

  it('excludes tags already on the property', () => {
    render(<SuggestingTags initial={['product']} />);

    act(() => getInput().focus());
    type('#prod');

    expect(suggestionLabels()).toEqual(['#product design']);
  });

  it('shows no menu for an empty query or when nothing matches', () => {
    render(<SuggestingTags initial={[]} />);

    act(() => getInput().focus());
    type('#');
    expect(suggestionLabels()).toEqual([]);

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
    expect(suggestionLabels()).toEqual([]);
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

  it('Space adds exactly what was typed — a new tag when nothing matches', () => {
    render(<SuggestingTags initial={[]} />);

    act(() => getInput().focus());
    type('#newtag');
    press(' ');
    expect(storedValue()).toEqual(['newtag']);

    type('#pro');
    press(' ');
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
    press(' ');
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

    expect(suggestionLabels()).toEqual([]);
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
