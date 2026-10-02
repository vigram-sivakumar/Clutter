// @vitest-environment jsdom

import { act, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SHAKE_DURATION_MS } from '@components/editable-text/EditableText';

import { PropertyList } from './PropertyList';
import { UrlPropertyValue, parseUrlPropertyInput } from './UrlPropertyValue';

const openExternalUrl = vi.fn<(url: string) => Promise<void>>(async () => {});

vi.mock('@shared/helpers/openExternalUrl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/helpers/openExternalUrl')>();
  return { ...actual, openExternalUrl: (url: string) => openExternalUrl(url) };
});

beforeEach(() => {
  openExternalUrl.mockClear();
});

afterEach(() => {
  cleanup();
});

function getField(): HTMLInputElement {
  return screen.getByRole('textbox', { name: 'Site' }) as HTMLInputElement;
}

function type(text: string) {
  fireEvent.change(getField(), { target: { value: text } });
}

function isShaking(): boolean {
  return getField().parentElement!.classList.contains('editable-text--shake');
}

function StatefulUrl({ initial }: { initial: string | null }) {
  const [value, setValue] = useState(initial);
  return <UrlPropertyValue name="Site" value={value} editable onCommit={setValue} />;
}

describe('parseUrlPropertyInput', () => {
  it('accepts http(s) URLs and bare domains, keeping the text as typed (trimmed)', () => {
    expect(parseUrlPropertyInput('https://example.com/a')).toBe('https://example.com/a');
    expect(parseUrlPropertyInput('  http://example.com  ')).toBe('http://example.com');
    expect(parseUrlPropertyInput('example.com')).toBe('example.com');
    expect(parseUrlPropertyInput('docs.example.com/path?q=1')).toBe('docs.example.com/path?q=1');
  });

  it('rejects text that is not a web URL', () => {
    expect(parseUrlPropertyInput('')).toBeNull();
    expect(parseUrlPropertyInput('hello')).toBeNull();
    expect(parseUrlPropertyInput('hello world')).toBeNull();
    expect(parseUrlPropertyInput('javascript:alert(1)')).toBeNull();
    expect(parseUrlPropertyInput('mailto:a@b.com')).toBeNull();
    expect(parseUrlPropertyInput('https://')).toBeNull();
  });
});

describe('UrlPropertyValue — read-only', () => {
  it('renders the URL as a link, with no input', () => {
    render(<UrlPropertyValue name="Site" value="example.com" editable={false} />);

    const link = screen.getByRole('link', { name: 'example.com' });
    expect(link.classList.contains('property-list__link')).toBe(true);
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('opens the URL through openExternalUrl, not the anchor navigation', () => {
    render(<UrlPropertyValue name="Site" value="https://example.com/a" editable={false} />);

    const notCancelled = fireEvent.click(screen.getByRole('link'));

    expect(notCancelled).toBe(false);
    expect(openExternalUrl).toHaveBeenCalledExactlyOnceWith('https://example.com/a');
  });

  it('renders nothing for an absent value', () => {
    render(<UrlPropertyValue name="Site" value={null} editable={false} />);

    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('UrlPropertyValue — editable', () => {
  it('renders a single-line input showing the URL, styled as a link at rest', () => {
    render(<StatefulUrl initial="https://example.com" />);

    const field = getField();
    expect(field.tagName).toBe('INPUT');
    expect(field.value).toBe('https://example.com');
    expect(field.parentElement!.classList.contains('property-list__url-input--link')).toBe(true);
  });

  it('shows the "Empty" placeholder when there is no value', () => {
    render(<StatefulUrl initial={null} />);

    expect(getField().value).toBe('');
    expect(getField().placeholder).toBe('Empty');
  });

  it('commits a valid URL on Enter, stored as typed', () => {
    const onCommit = vi.fn();
    render(<UrlPropertyValue name="Site" value={null} editable onCommit={onCommit} />);

    fireEvent.focus(getField());
    type('example.com/docs');
    fireEvent.keyDown(getField(), { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledExactlyOnceWith('example.com/docs');
  });

  it('commits a valid URL on blur', () => {
    const onCommit = vi.fn();
    render(<UrlPropertyValue name="Site" value={null} editable onCommit={onCommit} />);

    fireEvent.focus(getField());
    type('https://example.com');
    fireEvent.blur(getField());

    expect(onCommit).toHaveBeenCalledExactlyOnceWith('https://example.com');
  });

  it('Enter on an invalid URL shakes, keeps the text and focus, and commits nothing', () => {
    const onCommit = vi.fn();
    render(
      <UrlPropertyValue name="Site" value="https://example.com" editable onCommit={onCommit} />
    );

    act(() => getField().focus());
    type('not a url');
    fireEvent.keyDown(getField(), { key: 'Enter' });

    expect(isShaking()).toBe(true);
    expect(getField().value).toBe('not a url');
    expect(document.activeElement).toBe(getField());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('stops shaking after the shared shake duration', () => {
    vi.useFakeTimers();
    try {
      render(<StatefulUrl initial="https://example.com" />);

      act(() => getField().focus());
      type('nope');
      fireEvent.keyDown(getField(), { key: 'Enter' });
      expect(isShaking()).toBe(true);

      act(() => vi.advanceTimersByTime(SHAKE_DURATION_MS));
      expect(isShaking()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('blur with an invalid URL discards it and restores the last valid value', () => {
    const onCommit = vi.fn();
    render(
      <UrlPropertyValue name="Site" value="https://example.com" editable onCommit={onCommit} />
    );

    act(() => getField().focus());
    type('javascript:alert(1)');
    act(() => getField().blur());

    expect(onCommit).not.toHaveBeenCalled();
    expect(getField().value).toBe('https://example.com');
  });

  it('emptying the text clears the value', () => {
    render(<StatefulUrl initial="https://example.com" />);

    act(() => getField().focus());
    type('');
    fireEvent.keyDown(getField(), { key: 'Enter' });

    expect(isShaking()).toBe(false);
    act(() => getField().blur());
    expect(getField().value).toBe('');
    expect(getField().placeholder).toBe('Empty');
  });

  it('shows Input background and border only while editing', () => {
    render(<StatefulUrl initial="https://example.com" />);

    const wrapper = getField().parentElement!;
    expect(wrapper.classList.contains('input--background')).toBe(false);

    fireEvent.focus(getField());
    expect(wrapper.classList.contains('input--background')).toBe(true);
    expect(wrapper.classList.contains('input--border')).toBe(true);
    expect(wrapper.classList.contains('property-list__url-input--link')).toBe(false);

    fireEvent.blur(getField());
    expect(wrapper.classList.contains('input--background')).toBe(false);
  });
});

describe('PropertyList url Property', () => {
  it('renders a read-only url Property as a link', () => {
    render(
      <PropertyList items={[{ name: 'Site', type: 'url', value: 'example.com', editable: false }]} />
    );

    expect(screen.getByRole('link', { name: 'example.com' })).toBeTruthy();
  });

  it('renders an editable url Property as an input', () => {
    render(
      <PropertyList
        items={[
          { name: 'Site', type: 'url', value: 'example.com', editable: true, onCommit: () => {} },
        ]}
      />
    );

    expect(getField().value).toBe('example.com');
  });
});
