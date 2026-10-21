// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PageDivider, type DividerVariant } from './PageDivider';
import {
  readHeaderSeparatorMode,
  writeHeaderSeparatorMode,
  writeHeaderSeparatorStyle,
} from './headerSeparator';
import { Page } from './Page';

afterEach(cleanup);

describe('PageDivider', () => {
  it('is a solid horizontal separator by default', () => {
    render(<PageDivider />);

    const divider = screen.getByRole('separator');
    expect(divider).toHaveClass('page-divider', 'page-divider--solid');
    expect(divider).toHaveAttribute('data-variant', 'solid');
  });

  it.each(['solid', 'wavy', 'dotted'] as const)('renders the %s variant', (variant) => {
    render(<PageDivider variant={variant} />);

    const divider = screen.getByRole('separator');
    expect(divider).toHaveClass('page-divider', `page-divider--${variant}`);
    expect(divider).toHaveAttribute('data-variant', variant);
  });

  it('renders only the chosen variant', () => {
    render(<PageDivider variant="dotted" />);

    expect(screen.getByRole('separator')).not.toHaveClass('page-divider--solid', 'page-divider--wavy');
  });
});

describe('the divider variants share the editor\'s rule shapes', () => {
  const read = (path: string) => readFileSync(join(__dirname, path), 'utf8');
  const tokens = read('../../../design-system/tokens.css');
  const editor = read('../../../features/markdown/editor/MarkdownEditor.css');
  const divider = read('./PageDivider.css');

  it('defines each mask shape once, in the tokens', () => {
    expect(tokens.match(/--hr-wavy-mask:/g)).toHaveLength(1);
    expect(tokens.match(/--hr-dotted-mask:/g)).toHaveLength(1);
    expect(editor).not.toContain('data:image/svg+xml');
    expect(divider).not.toContain('data:image/svg+xml');
  });

  it('paints the wavy and dotted variants with those masks, at the editor\'s tile sizes', () => {
    expect(divider).toMatch(/\.page-divider--wavy[^}]*mask-image: var\(--hr-wavy-mask\)[^}]*mask-size: 16px 6px/s);
    expect(divider).toMatch(/\.page-divider--dotted[^}]*mask-image: var\(--hr-dotted-mask\)[^}]*mask-size: 6px 2px/s);
    expect(editor).toContain('mask-image: var(--hr-wavy-mask)');
    expect(editor).toContain('mask-image: var(--hr-dotted-mask)');
  });
});

describe('Page — the header separator', () => {
  const props = <div data-testid="props" />;
  // A note page: the one kind of page that applies the Header separator preferences.
  const renderPage = (properties?: React.ReactNode, dividerVariant?: DividerVariant) =>
    render(
      <Page
        title="T"
        appliesHeaderSeparator
        properties={properties}
        dividerVariant={dividerVariant}
        body={<div data-testid="body" />}
      />
    );
  const separator = () => screen.queryByRole('separator');

  beforeEach(() => localStorage.clear());

  it('sits between the Properties list and the body', () => {
    renderPage(props);

    const list = screen.getByTestId('props').closest('.page__properties')!;
    const divider = screen.getByRole('separator');
    const body = screen.getByTestId('body').closest('.page__body')!;
    expect(list.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(divider.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  describe('Automatic (the default)', () => {
    it('shows it when the Properties section is on screen', () => {
      renderPage(props);

      expect(separator()).not.toBeNull();
    });

    it('shows it when the section is only its "Add a property" row', () => {
      renderPage(<button type="button">Add a property</button>);

      expect(separator()).not.toBeNull();
    });

    it('hides it when there is no Properties section', () => {
      renderPage(undefined);

      expect(separator()).toBeNull();
    });
  });

  describe('Always show', () => {
    beforeEach(() => localStorage.setItem('clutter-header-separator', 'show'));

    it('shows it with the Properties section', () => {
      renderPage(props);

      expect(separator()).not.toBeNull();
    });

    it('shows it without one, between the header and the body', () => {
      renderPage(undefined);

      const divider = separator()!;
      expect(divider).not.toBeNull();
      expect(
        divider.compareDocumentPosition(screen.getByTestId('body').closest('.page__body')!) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });
  });

  describe('Always hide', () => {
    beforeEach(() => localStorage.setItem('clutter-header-separator', 'hide'));

    it.each([['with', props], ['without', undefined]])('never shows it %s a Properties section', (_label, properties) => {
      renderPage(properties);

      expect(separator()).toBeNull();
    });
  });

  it('follows a change of the preference while the page is open', () => {
    renderPage(props);
    expect(separator()).not.toBeNull();

    act(() => writeHeaderSeparatorMode('hide'));
    expect(separator()).toBeNull();

    act(() => writeHeaderSeparatorMode('show'));
    expect(separator()).not.toBeNull();
  });

  describe('visibility and appearance are independent', () => {
    it.each(['solid', 'wavy', 'dotted'] as const)('the %s style shows and hides with the preference, and keeps its style', (variant) => {
      renderPage(props, variant);
      expect(separator()).toHaveAttribute('data-variant', variant);

      act(() => writeHeaderSeparatorMode('hide'));
      expect(separator()).toBeNull();

      act(() => writeHeaderSeparatorMode('automatic'));
      expect(separator()).toHaveAttribute('data-variant', variant);

      act(() => writeHeaderSeparatorMode('show'));
      expect(separator()).toHaveAttribute('data-variant', variant);
    });

    it('changing the preference never changes the style, and the style never changes visibility', () => {
      const { rerender } = renderPage(undefined, 'wavy');
      expect(separator()).toBeNull();

      rerender(<Page title="T" appliesHeaderSeparator dividerVariant="dotted" body={<div />} />);
      expect(separator()).toBeNull();

      act(() => writeHeaderSeparatorMode('show'));
      expect(separator()).toHaveAttribute('data-variant', 'dotted');
      expect(readHeaderSeparatorMode()).toBe('show');
    });
  });

  describe('the Header separator style preference', () => {
    it('is a solid line by default', () => {
      renderPage(props);

      expect(separator()).toHaveAttribute('data-variant', 'solid');
    });

    it.each(['solid', 'wavy', 'dotted'] as const)('draws the %s style when it is chosen, and follows a change', (style) => {
      renderPage(props);

      act(() => writeHeaderSeparatorStyle(style));

      expect(separator()).toHaveAttribute('data-variant', style);
    });

    it('applies to a page with no Properties section too, once the separator is always shown', () => {
      localStorage.setItem('clutter-header-separator', 'show');
      localStorage.setItem('clutter-header-separator-style', 'dotted');
      renderPage(undefined);

      expect(separator()).toHaveAttribute('data-variant', 'dotted');
    });

    it('does not change whether the separator shows', () => {
      renderPage(undefined);
      expect(separator()).toBeNull();

      act(() => writeHeaderSeparatorStyle('wavy'));

      expect(separator()).toBeNull();
    });

    it('is overridden by an explicit dividerVariant', () => {
      localStorage.setItem('clutter-header-separator-style', 'wavy');
      renderPage(props, 'dotted');

      expect(separator()).toHaveAttribute('data-variant', 'dotted');
    });
  });

  describe('scope: only a page that applies the preferences shows it', () => {
    const renderOtherPage = (properties?: React.ReactNode) =>
      render(<Page title="Folder" properties={properties} body={<div />} />);

    it.each([['automatic'], ['show'], ['hide']] as const)(
      'a page that does not apply it (a folder, collection or view) never shows it in %s mode',
      (mode) => {
        localStorage.setItem('clutter-header-separator', mode);
        localStorage.setItem('clutter-header-separator-style', 'wavy');
        renderOtherPage(props);

        expect(separator()).toBeNull();
      }
    );

    it('and ignores a later change of the preferences', () => {
      renderOtherPage(undefined);

      act(() => writeHeaderSeparatorMode('show'));
      act(() => writeHeaderSeparatorStyle('dotted'));

      expect(separator()).toBeNull();
    });
  });
});
