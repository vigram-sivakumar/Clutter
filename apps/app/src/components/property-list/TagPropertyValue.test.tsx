// @vitest-environment jsdom

import { act, useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PropertyList } from './PropertyList';
import { TagPropertyValue, parseTagInput } from './TagPropertyValue';

afterEach(() => {
  cleanup();
});

function getInput(): HTMLInputElement {
  return screen.getByRole('textbox', { name: 'Tags' }) as HTMLInputElement;
}

function pillLabels(container: HTMLElement = document.body): string[] {
  return [...container.querySelectorAll('.property-list__tag')].map(
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

    const productPill = [...document.querySelectorAll<HTMLElement>('.property-list__tag')][1]!;
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

describe('PropertyList tag Property', () => {
  it('renders a read-only tag Property (like Tags) as pills', () => {
    render(
      <PropertyList items={[{ name: 'Tags', type: 'tag', value: ['design'], editable: false }]} />
    );

    expect(pillLabels()).toEqual(['#design']);
  });
});
