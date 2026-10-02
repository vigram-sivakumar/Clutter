// @vitest-environment jsdom

import { act, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SHAKE_DURATION_MS } from '@components/editable-text/EditableText';

import { PropertyList } from './PropertyList';
import { formatCustomScalar, readCustomProperties } from '@core/vault/ingest/frontmatter/customFrontmatter';

import { UrlPropertyValue, parseUrlPropertyInput } from './UrlPropertyValue';

const openExternalUrl = vi.fn<(url: string) => Promise<void>>(async () => {});

vi.mock('@shared/helpers/openExternalUrl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/helpers/openExternalUrl')>();
  return { ...actual, openExternalUrl: (url: string) => openExternalUrl(url) };
});

const copyTextToClipboard = vi.fn<(text: string) => Promise<void>>(async () => {});

vi.mock('@shared/helpers/copyTextToClipboard', () => ({
  copyTextToClipboard: (text: string) => copyTextToClipboard(text),
}));

beforeEach(() => {
  openExternalUrl.mockClear();
  copyTextToClipboard.mockClear();
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

describe('parseUrlPropertyInput — one rule for the editor and the write', () => {
  it.each([
    ['https://example.com', 'https://example.com'],
    ['http://example.com/a/b?q=1#frag', 'http://example.com/a/b?q=1#frag'],
    ['https://example.com:8080/path', 'https://example.com:8080/path'],
    ['www.example.com', 'https://www.example.com'],
    ['www.example.com/docs', 'https://www.example.com/docs'],
    ['example.com', 'https://example.com'],
    ['example.co.uk/path?q=1', 'https://example.co.uk/path?q=1'],
    ['docs.example.dev', 'https://docs.example.dev'],
    ['  example.com  ', 'https://example.com'],
    ['http://localhost:3000', 'http://localhost:3000'],
    ['http://192.168.0.1/admin', 'http://192.168.0.1/admin'],
  ])('accepts %j, stored as %s', (text, stored) => {
    expect(parseUrlPropertyInput(text)).toBe(stored);
  });

  it('what it accepts always reads back as a url — never silently becomes text', () => {
    for (const text of ['https://example.com/a', 'www.example.com', 'example.co.uk/p', 'http://localhost:3000']) {
      const stored = parseUrlPropertyInput(text)!;
      const written = formatCustomScalar('url', stored);
      const read = readCustomProperties([`site: ${written}`])[0];

      expect(read).toMatchObject({ key: 'site', type: 'url', value: stored });
    }
  });

  it.each([
    '',
    'hello',
    'hello world',
    'see example.com',
    'readme.md',
    'hello.world',
    'javascript:alert(1)',
    'https://',
    '[label](https://example.com)',
    // Valid Markdown links, but a stored value like these reads back as text.
    'mailto:someone@example.com',
    'someone@example.com',
    'xmpp:someone@example.com',
  ])('rejects %j', (text) => {
    expect(parseUrlPropertyInput(text)).toBeNull();
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

  it('renders in a truncating cell, with the full URL as a tooltip', () => {
    const url = 'https://example.com/a/very/long/path/that/overflows';
    render(<UrlPropertyValue name="Site" value={url} editable={false} />);

    const link = screen.getByRole('link');
    expect(link.getAttribute('title')).toBe(url);
    expect(link.closest('.property-list__value--truncate')).not.toBeNull();
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

  it('has the full URL as a tooltip at rest, but not while editing', () => {
    render(<StatefulUrl initial="https://example.com/long/path" />);

    expect(getField().title).toBe('https://example.com/long/path');

    fireEvent.focus(getField());
    expect(getField().title).toBe('');
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

    expect(onCommit).toHaveBeenCalledExactlyOnceWith('https://example.com/docs');
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

describe('UrlPropertyValue — Open / Copy actions', () => {
  it("puts Open and Copy in a read-only URL's hover-revealed Entry actions slot", () => {
    render(<UrlPropertyValue name="Site" value="example.com" editable={false} />);

    const open = screen.getByRole('button', { name: 'Open link' });
    expect(open.closest('.entry__actions')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
  });

  it('shows them in the editable input at rest, and hides them while editing', () => {
    render(<StatefulUrl initial="https://example.com" />);

    const actions = () => screen.queryByRole('button', { name: 'Open link' });
    expect(actions()).not.toBeNull();
    expect(actions()!.closest('.input__trailing')).not.toBeNull();

    fireEvent.focus(getField());
    expect(actions()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();

    fireEvent.blur(getField());
    expect(actions()).not.toBeNull();
  });

  it('omits them when there is no URL', () => {
    render(<StatefulUrl initial={null} />);

    expect(screen.queryByRole('button', { name: 'Open link' })).toBeNull();
  });

  it('Open opens the URL through openExternalUrl', () => {
    render(<StatefulUrl initial="example.com/docs" />);

    fireEvent.click(screen.getByRole('button', { name: 'Open link' }));

    expect(openExternalUrl).toHaveBeenCalledExactlyOnceWith('example.com/docs');
  });

  it('Copy copies the URL as stored and briefly shows a check', async () => {
    render(<StatefulUrl initial="example.com/docs" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    });

    expect(copyTextToClipboard).toHaveBeenCalledExactlyOnceWith('example.com/docs');
    const copiedButton = screen.getByRole('button', { name: 'Copied' });
    // The plain `tick` icon (its single stroke path), not the boxed `check`.
    const paths = copiedButton.querySelectorAll('svg path');
    expect(paths).toHaveLength(1);
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
