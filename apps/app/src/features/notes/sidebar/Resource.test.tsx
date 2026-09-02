// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Resource } from './Resource';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import type { VaultResource } from '@core/vault/models/VaultResource';

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

function makeResource(overrides: Partial<VaultResource> = {}): VaultResource {
  return {
    id: 'resource-1',
    kind: 'image',
    name: 'photo.png',
    path: '/vault/Assets/photo.png',
    parentId: null,
    ...overrides,
  };
}

describe('Resource — icon selection', () => {
  it('renders the image icon for an image resource', () => {
    const { container } = render(<Resource resource={makeResource({ kind: 'image' })} />);

    expect(container.querySelector('.resource__icon svg')).toBeTruthy();
  });

  it('renders a different icon for a pdf resource than for an image resource', () => {
    const { container: imageContainer } = render(
      <Resource resource={makeResource({ kind: 'image' })} />
    );
    const { container: pdfContainer } = render(
      <Resource resource={makeResource({ kind: 'pdf' })} />
    );

    const imageSvg = imageContainer.querySelector('.resource__icon svg')?.outerHTML;
    const pdfSvg = pdfContainer.querySelector('.resource__icon svg')?.outerHTML;

    expect(imageSvg).toBeTruthy();
    expect(pdfSvg).toBeTruthy();
    expect(imageSvg).not.toBe(pdfSvg);
  });
});

describe('Resource — title rendering', () => {
  it('renders the resource name verbatim', () => {
    render(<Resource resource={makeResource({ name: 'floorplan.png' })} />);

    expect(screen.getByText('floorplan.png')).toBeDefined();
  });
});

describe('Resource — no overflow menu by default', () => {
  it('renders no overflow/three-dot button when no menuItems are supplied — the unwired, default render', () => {
    const { container } = render(<Resource resource={makeResource()} />);

    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

const resourceMenuItems: OverflowMenuItemConfig[] = [
  { id: 'rename', label: 'Rename', icon: 'notePencil', opensInlineEdit: true },
  { id: 'archive', label: 'Archive', icon: 'archive' },
];

function ResourceHarness({
  resource,
  onMenuSelect,
}: {
  resource: VaultResource;
  onMenuSelect: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Resource
      resource={resource}
      menuItems={resourceMenuItems}
      menuOpen={menuOpen}
      onMenuOpenChange={setMenuOpen}
      onMenuSelect={onMenuSelect}
    />
  );
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { hidden: false }));
}

describe('Resource — overflow menu', () => {
  it('renders the overflow/three-dot button when menuItems are supplied', () => {
    render(<Resource resource={makeResource()} menuItems={resourceMenuItems} />);

    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('the menu contains exactly Rename and Archive', () => {
    render(<ResourceHarness resource={makeResource()} onMenuSelect={vi.fn()} />);

    openMenu();

    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.queryByText('Add to Favorites')).toBeNull();
    expect(screen.queryByText('Remove from Favorites')).toBeNull();
    expect(screen.queryByText('Restore')).toBeNull();
    expect(screen.queryByText('Delete permanently')).toBeNull();
  });

  it('selecting Rename dispatches through onMenuSelect', () => {
    const onMenuSelect = vi.fn();
    render(<ResourceHarness resource={makeResource()} onMenuSelect={onMenuSelect} />);

    openMenu();
    fireEvent.click(screen.getByText('Rename'));

    expect(onMenuSelect).toHaveBeenCalledWith('rename');
  });

  it('selecting Archive dispatches through onMenuSelect', () => {
    const onMenuSelect = vi.fn();
    render(<ResourceHarness resource={makeResource()} onMenuSelect={onMenuSelect} />);

    openMenu();
    fireEvent.click(screen.getByText('Archive'));

    expect(onMenuSelect).toHaveBeenCalledWith('archive');
  });

  it('a pdf resource still shows a working overflow menu', () => {
    const onMenuSelect = vi.fn();
    render(<ResourceHarness resource={makeResource({ kind: 'pdf' })} onMenuSelect={onMenuSelect} />);

    openMenu();
    fireEvent.click(screen.getByText('Archive'));

    expect(onMenuSelect).toHaveBeenCalledWith('archive');
  });
});

describe('Resource — rename editing', () => {
  it('isEditing renders an EditableText field seeded with the name minus its extension — the user never sees or types the extension', () => {
    render(<Resource resource={makeResource({ name: 'floorplan.png' })} isEditing />);

    expect(screen.getByRole('textbox')).toHaveTextContent('floorplan');
  });

  it('committing a changed value calls onTitleCommit with the extension-free value', () => {
    const onTitleCommit = vi.fn();
    render(
      <Resource
        resource={makeResource({ name: 'floorplan.png' })}
        isEditing
        onTitleCommit={onTitleCommit}
      />
    );

    const field = screen.getByRole('textbox');
    fireEvent.input(field, { target: { textContent: 'holiday' } });
    fireEvent.blur(field);

    expect(onTitleCommit).toHaveBeenCalledWith('holiday');
  });

  it('committing an unchanged value does not call onTitleCommit', () => {
    const onTitleCommit = vi.fn();
    render(
      <Resource
        resource={makeResource({ name: 'floorplan.png' })}
        isEditing
        onTitleCommit={onTitleCommit}
      />
    );

    const field = screen.getByRole('textbox');
    fireEvent.blur(field);

    expect(onTitleCommit).not.toHaveBeenCalled();
  });

  it('Escape cancels — does not call onTitleCommit, still fires onTitleEditingEnd', () => {
    const onTitleCommit = vi.fn();
    const onTitleEditingEnd = vi.fn();
    render(
      <Resource
        resource={makeResource({ name: 'floorplan.png' })}
        isEditing
        onTitleCommit={onTitleCommit}
        onTitleEditingEnd={onTitleEditingEnd}
      />
    );

    const field = screen.getByRole('textbox');
    fireEvent.input(field, { target: { textContent: 'holiday' } });
    fireEvent.keyDown(field, { key: 'Escape' });

    expect(onTitleCommit).not.toHaveBeenCalled();
    expect(onTitleEditingEnd).toHaveBeenCalled();
  });

  it('blur commits and fires onTitleEditingEnd, ending the rename session', () => {
    const onTitleEditingEnd = vi.fn();
    render(
      <Resource
        resource={makeResource({ name: 'floorplan.png' })}
        isEditing
        onTitleEditingEnd={onTitleEditingEnd}
      />
    );

    fireEvent.blur(screen.getByRole('textbox'));

    expect(onTitleEditingEnd).toHaveBeenCalled();
  });

  it('a pdf resource supports rename the same way an image resource does', () => {
    const onTitleCommit = vi.fn();
    render(
      <Resource
        resource={makeResource({ kind: 'pdf', name: 'contract.pdf' })}
        isEditing
        onTitleCommit={onTitleCommit}
      />
    );

    const field = screen.getByRole('textbox');
    expect(field).toHaveTextContent('contract');
    fireEvent.input(field, { target: { textContent: 'signed-contract' } });
    fireEvent.blur(field);

    expect(onTitleCommit).toHaveBeenCalledWith('signed-contract');
  });

  it('a row mid-rename does not navigate on click', () => {
    const onClick = vi.fn();
    render(
      <Resource resource={makeResource({ kind: 'image' })} isEditing onClick={onClick} />
    );

    fireEvent.click(screen.getByRole('textbox'));

    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Resource — click behavior', () => {
  it('a pdf resource does nothing on click, even when onClick is provided', () => {
    const onClick = vi.fn();
    render(<Resource resource={makeResource({ kind: 'pdf' })} onClick={onClick} />);

    fireEvent.click(screen.getByText('photo.png').closest('.entry')!);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('an image resource invokes onClick with the resource, reaching the existing image-overlay wiring', () => {
    const onClick = vi.fn();
    const resource = makeResource({ kind: 'image' });
    render(<Resource resource={resource} onClick={onClick} />);

    fireEvent.click(screen.getByText('photo.png').closest('.entry')!);

    expect(onClick).toHaveBeenCalledWith(resource);
  });

  it('an image resource with no onClick provided renders non-interactive', () => {
    const { container } = render(<Resource resource={makeResource({ kind: 'image' })} />);

    expect(container.querySelector('.entry-interactive')).toBeNull();
  });
});
