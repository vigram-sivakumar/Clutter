// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssetsCollectionBody } from './AssetsCollectionBody';
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
    name: 'house.png',
    path: '/vault/Assets/house.png',
    parentId: 'assets-folder',
    ...overrides,
  };
}

function renderAssets(
  props: Partial<Omit<Parameters<typeof AssetsCollectionBody>[0], 'resources'>> & {
    resources: VaultResource[];
  }
) {
  return render(
    <AssetsCollectionBody
      onRenameResource={vi.fn()}
      onArchiveResource={vi.fn()}
      onDownloadResource={vi.fn()}
      resourceMoveDestinations={[]}
      onMoveResource={vi.fn()}
      onCreateFolder={vi.fn(async () => 'created-folder')}
      {...props}
    />
  );
}

function openMenuFor(rowTitle: string) {
  const row = screen.getByText(rowTitle).closest('.entry')!;
  fireEvent.click(row.querySelector('button[aria-haspopup="menu"]')!);
}

describe('AssetsCollectionBody: membership', () => {
  it('renders every resource in the collection', () => {
    const resources = [
      makeResource({ id: 'house', name: 'house.png', kind: 'image' }),
      makeResource({ id: 'manual', name: 'manual.pdf', kind: 'pdf' }),
      makeResource({ id: 'floorplan', name: 'floorplan.png', kind: 'image', parentId: null }),
    ];

    renderAssets({ resources });

    expect(screen.getByText('house')).toBeInTheDocument();
    expect(screen.getByText('manual')).toBeInTheDocument();
    expect(screen.getByText('floorplan')).toBeInTheDocument();
  });

  it('renders a resource physically inside Assets/', () => {
    const resource = makeResource({ path: '/vault/Assets/house.png', parentId: 'assets-folder' });

    renderAssets({ resources: [resource] });

    expect(screen.getByText('house')).toBeInTheDocument();
  });

  it('renders a resource physically outside Assets/ — membership is not location-scoped', () => {
    const resource = makeResource({
      name: 'floorplan.png',
      path: '/vault/Projects/floorplan.png',
      parentId: 'projects-folder',
    });

    renderAssets({ resources: [resource] });

    expect(screen.getByText('floorplan')).toBeInTheDocument();
  });

  it('distinguishes image and pdf resources by icon', () => {
    const resources = [
      makeResource({ id: 'house', name: 'house.png', kind: 'image' }),
      makeResource({ id: 'manual', name: 'manual.pdf', kind: 'pdf' }),
    ];

    renderAssets({ resources });

    const imageIcon = screen.getByText('house').closest('.entry')?.querySelector('.resource__icon svg')?.outerHTML;
    const pdfIcon = screen.getByText('manual').closest('.entry')?.querySelector('.resource__icon svg')?.outerHTML;

    expect(imageIcon).toBeTruthy();
    expect(pdfIcon).toBeTruthy();
    expect(imageIcon).not.toBe(pdfIcon);
  });

  it('renders correctly with an empty collection — the physical Assets/ folder itself is never treated as content', () => {
    const { container } = renderAssets({ resources: [] });

    expect(container.querySelectorAll('.entry')).toHaveLength(0);
  });

  // Markdown/unsupported-file exclusion is a type-level guarantee, not
  // something this component (or MembershipSelector.getAllVisibleResources,
  // its real data source) could violate: a Page and a VaultResource are
  // disjoint Vault collections (ResourceBuilder never routes a .md file
  // through DocumentLoader — see VaultResource's own doc comment), so a
  // Page can structurally never appear in `resources` here. This test
  // documents that guarantee rather than exercising a filter this
  // component doesn't own — exactly the resources given are exactly the
  // rows rendered, nothing more, nothing filtered further.
  it('renders exactly the resources it is given, only image/pdf kinds ever being possible', () => {
    const resources = [
      makeResource({ id: 'r1', kind: 'image', name: 'a.png' }),
      makeResource({ id: 'r2', kind: 'pdf', name: 'b.pdf' }),
    ];

    const { container } = renderAssets({ resources });

    expect(container.querySelectorAll('.entry')).toHaveLength(2);
  });
});

describe('AssetsCollectionBody: image/pdf click behavior', () => {
  it('clicking an image resource invokes onOpenImage with the resource, reaching the existing image overlay', () => {
    const onOpenImage = vi.fn();
    const resource = makeResource({ id: 'house', name: 'house.png', kind: 'image' });

    renderAssets({ resources: [resource], onOpenImage });

    fireEvent.click(screen.getByText('house').closest('.entry')!);

    expect(onOpenImage).toHaveBeenCalledWith(resource);
  });

  it('clicking a pdf resource does nothing — no PDF viewer exists yet', () => {
    const onOpenImage = vi.fn();
    const resource = makeResource({ id: 'manual', name: 'manual.pdf', kind: 'pdf' });

    renderAssets({ resources: [resource], onOpenImage });

    fireEvent.click(screen.getByText('manual').closest('.entry')!);

    expect(onOpenImage).not.toHaveBeenCalled();
  });
});

describe('AssetsCollectionBody: actions menu', () => {
  it('shows the overflow menu with exactly Rename, Move to, and Archive, nothing else', () => {
    const resource = makeResource();

    renderAssets({ resources: [resource] });

    openMenuFor('house');

    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Move to…')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.queryByText('Add to Favorites')).toBeNull();
    expect(screen.queryByText('Remove from Favorites')).toBeNull();
    expect(screen.queryByText('Restore')).toBeNull();
    expect(screen.queryByText('Delete permanently')).toBeNull();
  });

  it('a pdf resource shows the same base menu as an image resource, minus Download', () => {
    const resource = makeResource({ kind: 'pdf', name: 'manual.pdf' });

    renderAssets({ resources: [resource] });

    openMenuFor('manual');

    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Move to…')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.queryByText('Download')).not.toBeInTheDocument();
  });

  it('an image resource additionally shows Download', () => {
    const resource = makeResource({ kind: 'image', name: 'house.png' });

    renderAssets({ resources: [resource] });

    openMenuFor('house');

    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  it('selecting Download calls onDownloadResource with the resource id', () => {
    const onDownloadResource = vi.fn();
    const resource = makeResource({ kind: 'image', name: 'house.png' });

    renderAssets({ resources: [resource], onDownloadResource });

    openMenuFor('house');
    fireEvent.click(screen.getByText('Download'));

    expect(onDownloadResource).toHaveBeenCalledWith('resource-1');
  });
});

describe('AssetsCollectionBody: move', () => {
  it('selecting Move to… opens the destination picker, and choosing a destination calls onMoveResource', () => {
    const onMoveResource = vi.fn();
    const resource = makeResource();

    renderAssets({
      resources: [resource],
      onMoveResource,
      resourceMoveDestinations: [
        { id: 'folder-1', title: 'Projects', level: 0, parentId: null },
      ],
    });

    openMenuFor('house');
    fireEvent.click(screen.getByText('Move to…'));
    fireEvent.click(screen.getByText('Projects'));

    expect(onMoveResource).toHaveBeenCalledWith('resource-1', 'folder-1');
  });
});

describe('AssetsCollectionBody: rename', () => {
  it('selecting Rename enters the editing state, seeded with the extension-free name', () => {
    const resource = makeResource({ name: 'house.png' });

    renderAssets({ resources: [resource] });

    openMenuFor('house');
    fireEvent.click(screen.getByText('Rename'));

    expect(screen.getByRole('textbox')).toHaveTextContent('house');
  });

  it('committing a rename calls onRenameResource with the resource id and the extension-free typed value', () => {
    const onRenameResource = vi.fn();
    const resource = makeResource({ name: 'house.png' });

    renderAssets({ resources: [resource], onRenameResource });

    openMenuFor('house');
    fireEvent.click(screen.getByText('Rename'));
    const field = screen.getByRole('textbox');
    fireEvent.input(field, { target: { textContent: 'cottage' } });
    fireEvent.blur(field);

    expect(onRenameResource).toHaveBeenCalledWith('resource-1', 'cottage');
  });

  it('does not pass a destination/parentId — the resource keeps its current parent, Rename never moves it into Assets/', () => {
    // ResourceOperations.renameResource(resourceId, name) is a two-argument
    // call; this component has no parentId/path concept of its own to pass
    // — the Gate/MoveService (Step 3/4) are what preserve the resource's
    // existing parentId, not this component. Asserting the exact call
    // signature is the correct-altitude test here.
    const onRenameResource = vi.fn();
    const resource = makeResource({
      name: 'house.png',
      path: '/vault/Projects/house.png',
      parentId: 'projects-folder',
    });

    renderAssets({ resources: [resource], onRenameResource });

    openMenuFor('house');
    fireEvent.click(screen.getByText('Rename'));
    const field = screen.getByRole('textbox');
    fireEvent.input(field, { target: { textContent: 'cottage' } });
    fireEvent.blur(field);

    expect(onRenameResource).toHaveBeenCalledWith('resource-1', 'cottage');
    expect(onRenameResource.mock.calls[0]).toHaveLength(2);
  });

  it('preserves the extension — the typed value never includes it', () => {
    const onRenameResource = vi.fn();
    const resource = makeResource({ kind: 'pdf', name: 'manual.pdf' });

    renderAssets({ resources: [resource], onRenameResource });

    openMenuFor('manual');
    fireEvent.click(screen.getByText('Rename'));
    const field = screen.getByRole('textbox');
    fireEvent.input(field, { target: { textContent: 'guide' } });
    fireEvent.blur(field);

    expect(onRenameResource).toHaveBeenCalledWith('resource-1', 'guide');
  });

  it('a row mid-rename does not open the image overlay on click', () => {
    const onOpenImage = vi.fn();
    const resource = makeResource({ kind: 'image', name: 'house.png' });

    renderAssets({ resources: [resource], onOpenImage });

    openMenuFor('house');
    fireEvent.click(screen.getByText('Rename'));
    fireEvent.click(screen.getByRole('textbox'));

    expect(onOpenImage).not.toHaveBeenCalled();
  });
});

describe('AssetsCollectionBody: archive', () => {
  it('selecting Archive calls onArchiveResource with the resource id, no confirmation dialog', () => {
    const onArchiveResource = vi.fn();
    const resource = makeResource();

    renderAssets({ resources: [resource], onArchiveResource });

    openMenuFor('house');
    fireEvent.click(screen.getByText('Archive'));

    expect(onArchiveResource).toHaveBeenCalledWith('resource-1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('works identically for a pdf resource', () => {
    const onArchiveResource = vi.fn();
    const resource = makeResource({ kind: 'pdf', name: 'manual.pdf' });

    renderAssets({ resources: [resource], onArchiveResource });

    openMenuFor('manual');
    fireEvent.click(screen.getByText('Archive'));

    expect(onArchiveResource).toHaveBeenCalledWith('resource-1');
  });

  // The component itself never removes a row — this proves it re-renders
  // correctly (row gone) once the caller supplies an updated `resources`
  // list, the same "state update, not manual list manipulation" contract
  // the real app fulfills via Vault's subscribe/notify -> re-render.
  it('the archived resource disappears once the caller re-renders with an updated resources list', () => {
    const resource = makeResource();

    function Harness() {
      const [resources, setResources] = useState([resource]);

      return (
        <AssetsCollectionBody
          resources={resources}
          onRenameResource={vi.fn()}
          onArchiveResource={() => setResources([])}
          onDownloadResource={vi.fn()}
          resourceMoveDestinations={[]}
          onMoveResource={vi.fn()}
          onCreateFolder={vi.fn(async () => 'created-folder')}
        />
      );
    }

    render(<Harness />);

    expect(screen.getByText('house')).toBeInTheDocument();

    openMenuFor('house');
    fireEvent.click(screen.getByText('Archive'));

    expect(screen.queryByText('house')).toBeNull();
  });
});
