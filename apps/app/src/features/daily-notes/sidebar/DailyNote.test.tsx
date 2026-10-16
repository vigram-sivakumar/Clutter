// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DailyNote } from './DailyNote';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';

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

describe('DailyNote — compact Markdown title rendering', () => {
  it('renders a plain-text title verbatim, unchanged from before', () => {
    render(<DailyNote title="Plain title" />);

    expect(screen.getByText('Plain title')).toBeDefined();
  });

  it('renders mixed Markdown in the title as compact Markdown, not raw syntax', () => {
    const { container } = render(
      <DailyNote title="**Ship** [[Project Alpha]] by @2020-01-15 #urgent" />
    );

    const titleEl = container.querySelector('.daily-note__title')!;
    expect(titleEl.querySelector('strong')).toHaveTextContent('Ship');
    expect(titleEl.querySelector('.compact-markdown-wikilink')).toHaveTextContent('Project Alpha');
    expect(titleEl.querySelector('.compact-markdown-tag')).toHaveTextContent('#urgent');
    expect(titleEl.querySelector('.compact-markdown-date')).toHaveTextContent('@15 January 2020');
    expect(titleEl).not.toHaveTextContent('**Ship**');
    expect(titleEl).not.toHaveTextContent('[[Project Alpha]]');
  });

  it('resolves a Tag title through the injected resolveTag, not the fallback', () => {
    const resolveTag = vi.fn().mockReturnValue({
      status: 'resolved' as const,
      displayLabel: 'Resolved Tag',
      activate: () => {},
    });

    const { container } = render(<DailyNote title="#Product_design" resolveTag={resolveTag} />);

    expect(resolveTag).toHaveBeenCalledWith('Product_design');
    expect(container.querySelector('.compact-markdown-tag')).toHaveTextContent('#Resolved Tag');
  });

  it('resolves an Embed title through the injected resolveEmbed, not the raw target path', () => {
    const resolveEmbed = vi.fn().mockReturnValue({
      status: 'resolved' as const,
      pageId: 'page-1',
      title: 'Project Alpha',
      markdown: '',
      icon: 'note' as const,
      emoji: null,
    });

    const { container } = render(<DailyNote title="![[Projects/Alpha]]" resolveEmbed={resolveEmbed} />);

    expect(resolveEmbed).toHaveBeenCalledWith('Projects/Alpha');
    expect(container.querySelector('.daily-note__title')).toHaveTextContent('Project Alpha');
    expect(container).not.toHaveTextContent('![[');
  });

  it('row click still fires normally when the title contains Markdown', () => {
    const onClick = vi.fn();
    render(<DailyNote title="**Ship** it" onClick={onClick} />);

    fireEvent.click(screen.getByText('Ship').closest('.entry')!);

    expect(onClick).toHaveBeenCalled();
  });
});

describe('DailyNote — title truncation', () => {
  it('marks the title .truncate, explicitly rather than via Entry.css', () => {
    render(<DailyNote title="Plain title" />);

    expect(screen.getByText('Plain title').closest('.daily-note__title')).toHaveClass('truncate');
  });
});

describe('DailyNote — emoji', () => {
  it('shows the emoji in the row\'s trailing metadata slot, beside the (hover-revealed) actions', () => {
    const { container } = render(
      <DailyNote title="Plain title" emoji="🍄" menuItems={[{ id: 'archive', label: 'Archive', icon: 'archive' }]} />
    );

    const meta = container.querySelector('.entry__trailing > .entry__meta')!;
    expect(meta).toHaveTextContent('🍄');
    expect(container.querySelector('.entry__trailing > .entry__actions')).toBeInTheDocument();
  });

  it('uses Entry\'s own hide-trailing-on-hover behavior, so the emoji and the actions never show together', () => {
    const { container } = render(<DailyNote title="Plain title" emoji="🍄" />);

    // The swap itself is Entry.css (.entry-hide-trailing-on-hover :hover .entry__meta) — nothing custom here.
    expect(container.querySelector('.entry')).toHaveClass('entry-hide-trailing-on-hover');
  });

  it('keeps the emoji hidden (actions shown) while the row\'s menu is open', () => {
    const { container } = render(<DailyNote title="Plain title" emoji="🍄" menuOpen />);

    expect(container.querySelector('.entry')).toHaveClass('entry-force-hover');
  });

  it('without an emoji it has no trailing metadata at all', () => {
    const { container } = render(<DailyNote title="Plain title" />);

    expect(container.querySelector('.entry__meta')).toBeNull();
    expect(container.querySelector('.entry')).not.toHaveClass('entry-force-hover');
  });
});

describe('DailyNote — Change icon wiring', () => {
  const menu: OverflowMenuItemConfig[] = [
    { id: 'change-icon', label: 'Change icon', icon: 'smile' },
    { id: 'archive', label: 'Archive', icon: 'archive' },
  ];

  function Harness({
    onMenuSelect,
    onChangeIcon,
    emoji,
  }: {
    onMenuSelect: (id: string) => void;
    onChangeIcon?: (emoji: string | null) => void;
    emoji?: string | null;
  }) {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
      <DailyNote
        title="Row"
        emoji={emoji}
        menuItems={menu}
        menuOpen={menuOpen}
        onMenuOpenChange={setMenuOpen}
        onMenuSelect={onMenuSelect}
        onChangeIcon={onChangeIcon}
      />
    );
  }

  function openMenu() {
    fireEvent.click(screen.getAllByRole('button').at(-1)!);
  }

  it("selecting 'Change icon' opens the shared picker and assigns the chosen emoji", () => {
    const onMenuSelect = vi.fn();
    const onChangeIcon = vi.fn();
    render(<Harness onMenuSelect={onMenuSelect} onChangeIcon={onChangeIcon} />);

    openMenu();
    fireEvent.click(screen.getByText('Change icon'));

    expect(onMenuSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'grinning face' }));

    expect(onChangeIcon).toHaveBeenCalledWith('😀');
  });

  it('replaces an existing emoji the same way', () => {
    const onChangeIcon = vi.fn();
    render(<Harness onMenuSelect={vi.fn()} onChangeIcon={onChangeIcon} emoji="🍄" />);

    openMenu();
    fireEvent.click(screen.getByText('Change icon'));
    fireEvent.click(screen.getByRole('button', { name: 'grinning face' }));

    expect(onChangeIcon).toHaveBeenCalledWith('😀');
  });

  it('removes the emoji (null) through the picker\'s remove button', () => {
    const onChangeIcon = vi.fn();
    render(<Harness onMenuSelect={vi.fn()} onChangeIcon={onChangeIcon} emoji="🍄" />);

    openMenu();
    fireEvent.click(screen.getByText('Change icon'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove icon' }));

    expect(onChangeIcon).toHaveBeenCalledWith(null);
  });

  it('disables remove when there is no emoji', () => {
    render(<Harness onMenuSelect={vi.fn()} onChangeIcon={vi.fn()} />);

    openMenu();
    fireEvent.click(screen.getByText('Change icon'));

    expect(screen.getByRole('button', { name: 'Remove icon' })).toBeDisabled();
  });
});
