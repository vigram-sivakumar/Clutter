// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PageTitleSection } from './Page.TitleSection';

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

describe('PageTitleSection — PageHeaderControls wiring', () => {
  it('always renders the More actions button, with or without an emoji', () => {
    const { rerender } = render(<PageTitleSection title="Untitled" />);
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();

    rerender(<PageTitleSection title="Untitled" emoji="📌" />);
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('renders the emoji button only when an emoji is supplied', () => {
    const { rerender } = render(<PageTitleSection title="Untitled" />);
    expect(screen.queryByRole('button', { name: 'Change emoji' })).not.toBeInTheDocument();

    rerender(<PageTitleSection title="Untitled" emoji="📌" />);
    expect(screen.getByRole('button', { name: 'Change emoji' })).toBeInTheDocument();
  });

  it('renders the emoji before More actions, matching the required [emoji] [More actions] order', () => {
    render(<PageTitleSection title="Untitled" emoji="📌" />);

    const controls = document.querySelector('.page-header-controls');
    const buttons = controls!.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute('aria-label', 'Change emoji');
    expect(buttons[1]).toHaveAttribute('aria-label', 'More actions');
  });

  it('renders the controls above the title, not beside it', () => {
    render(<PageTitleSection title="Untitled" />);

    const header = document.querySelector('.page-title-section')!;
    const controls = header.querySelector('.page-header-controls')!;
    const content = header.querySelector('.page-title-section__content')!;

    // .page-header-controls must precede .page-title-section__content
    // among header's children — DOM order is what puts it visually above
    // the title, since both are block-level children of the same flex
    // column (Page.TitleSection.css's `.page-title-section`).
    const position = controls.compareDocumentPosition(content);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leaves the existing title/actions row untouched', () => {
    render(
      <PageTitleSection
        title="Untitled"
        emoji="📌"
        actions={<button aria-label="Configure">Configure</button>}
      />
    );

    expect(screen.getByRole('button', { name: 'Configure' })).toBeInTheDocument();
    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });
});

describe('PageTitleSection — belowDescription slot', () => {
  it('renders nothing extra when belowDescription is omitted', () => {
    render(<PageTitleSection title="Untitled" description={<span>A description</span>} />);

    const content = document.querySelector('.page-title-section__content')!;
    // Just the title row and description — no third child.
    expect(content.children).toHaveLength(2);
  });

  it('renders belowDescription inside .page-title-section__content, after description', () => {
    render(
      <PageTitleSection
        title="Untitled"
        description={<span>A description</span>}
        belowDescription={<div data-testid="nav-row">nav</div>}
      />
    );

    const content = document.querySelector('.page-title-section__content')!;
    expect(screen.getByTestId('nav-row')).toBeInTheDocument();
    expect(content.lastElementChild).toBe(screen.getByTestId('nav-row'));
  });
});

describe('PageTitleSection — the three page-header-controls configurations', () => {
  it('user-owned (e.g. a Note/Folder/Tag): shows the emoji when set, and always mounts More actions', () => {
    render(<PageTitleSection title="My Note" emoji="🍄" />);

    expect(screen.getByRole('button', { name: 'Change emoji' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change emoji' })?.textContent).toContain('🍄');
  });

  it('system-reserved (e.g. Assets/Archive/Favorites): shows the fixed icon, never an emoji control, never More actions', () => {
    render(<PageTitleSection title="Assets" icon="layers" showMoreActions={false} />);

    expect(document.querySelector('.page-header-controls__icon')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change emoji' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it('Daily Notes: shows neither emoji nor icon, but still mounts More actions', () => {
    render(<PageTitleSection title="September 25, 2026" />);

    expect(screen.queryByRole('button', { name: 'Change emoji' })).not.toBeInTheDocument();
    expect(document.querySelector('.page-header-controls__icon')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('never leaves an empty placeholder for a missing emoji/icon', () => {
    render(<PageTitleSection title="September 25, 2026" />);

    const controls = document.querySelector('.page-header-controls')!;
    expect(controls.querySelector('.page-header-controls__emoji')).not.toBeInTheDocument();
    expect(controls.querySelector('.page-header-controls__icon')).not.toBeInTheDocument();
    // Only the always-mounted More actions button remains.
    expect(controls.children).toHaveLength(1);
  });
});

describe('PageTitleSection — the visible emoji is its own entry point', () => {
  it('clicking an already-set emoji opens the emoji picker directly, without opening More actions', () => {
    render(<PageTitleSection title="My Note" emoji="🍄" onSelectEmoji={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Change emoji' }));

    expect(screen.getByPlaceholderText('Search emoji')).toBeInTheDocument();
    // More actions' own root content never opened alongside it.
    expect(screen.queryByText('More actions')).not.toBeInTheDocument();
  });

  it('selecting a new emoji from that picker persists it and closes the picker', () => {
    const onSelectEmoji = vi.fn();
    render(<PageTitleSection title="My Note" emoji="🍄" onSelectEmoji={onSelectEmoji} />);

    fireEvent.click(screen.getByRole('button', { name: 'Change emoji' }));
    const firstEmoji = document.querySelector<HTMLButtonElement>('.emoji-tray__item')!;
    fireEvent.click(firstEmoji);

    expect(onSelectEmoji).toHaveBeenCalledTimes(1);
    expect(screen.queryByPlaceholderText('Search emoji')).not.toBeInTheDocument();
  });

  it('an already-set emoji still offers Cover image/Description in More actions, but never Emoji', () => {
    render(
      <PageTitleSection
        title="My Note"
        emoji="🍄"
        onSelectEmoji={vi.fn()}
        onSetCoverImage={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

    expect(screen.getByText('Cover image')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.queryByText('Emoji')).not.toBeInTheDocument();
  });
});

describe('PageTitleSection — there is no cover-image control in the header itself', () => {
  it('never renders a cover button/thumbnail in the header, regardless of hasCoverImage', () => {
    const { rerender } = render(
      <PageTitleSection title="My Note" onSetCoverImage={vi.fn()} hasCoverImage={false} />
    );
    expect(screen.queryByRole('button', { name: 'Change cover image' })).not.toBeInTheDocument();
    expect(document.querySelector('.page-header-controls__cover')).not.toBeInTheDocument();

    rerender(
      <PageTitleSection title="My Note" onSetCoverImage={vi.fn()} hasCoverImage={true} />
    );
    expect(screen.queryByRole('button', { name: 'Change cover image' })).not.toBeInTheDocument();
    expect(document.querySelector('.page-header-controls__cover')).not.toBeInTheDocument();
  });

  it('keeps the controls to [emoji] [More actions] even when a cover is set', () => {
    render(
      <PageTitleSection title="My Note" emoji="🍄" onSetCoverImage={vi.fn()} hasCoverImage />
    );

    const controls = document.querySelector('.page-header-controls')!;
    const buttons = controls.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute('aria-label', 'Change emoji');
    expect(buttons[1]).toHaveAttribute('aria-label', 'More actions');
  });

  it('hides "Cover image" from More actions once hasCoverImage is true, using the existing cover state — no header trigger takes its place', () => {
    render(
      <PageTitleSection
        title="My Note"
        onSelectEmoji={vi.fn()}
        onSetCoverImage={vi.fn()}
        hasCoverImage
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

    expect(screen.getByText('Emoji')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.queryByText('Cover image')).not.toBeInTheDocument();
  });

  it('when no cover is set, More actions still offers Cover image', () => {
    render(<PageTitleSection title="My Note" onSetCoverImage={vi.fn()} hasCoverImage={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

    expect(screen.getByText('Cover image')).toBeInTheDocument();
  });
});
