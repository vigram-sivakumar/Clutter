// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PropertyList } from '@components/property-list/PropertyList';
import type { Page } from '@core/vault/models/Page';
import { buildPageProperties } from './buildPageProperties';

// Overlay positions itself with a ResizeObserver, which jsdom lacks.
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => cleanup());

function pageWith(status: 'active' | 'archived'): Page {
  return {
    id: 'p1',
    type: 'note',
    name: 'x',
    path: '/v/x.md',
    parentId: null,
    metadata: {
      status,
      tags: [],
      aliases: [],
      createdAt: null,
      updatedAt: null,
      unownedFrontmatter: ['people:', '  - Ana', '  - Bo'],
    },
  } as unknown as Page;
}

const pills = () =>
  Array.from(document.querySelectorAll('.property-list__tag')).map((pill) => pill.textContent);

/** The real PropertyList over the real adapter, as PageHost composes them. */
function renderPeople(status: 'active' | 'archived', onCommitListValue = vi.fn()) {
  render(<PropertyList items={buildPageProperties(pageWith(status), { onCommitListValue })} />);
  return onCommitListValue;
}

describe('custom list property editing through buildPageProperties', () => {
  it('adding a value commits the complete list', () => {
    const onCommitListValue = renderPeople('active');

    const input = screen.getByRole('textbox', { name: 'people' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Cy' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommitListValue).toHaveBeenCalledExactlyOnceWith('people', ['Ana', 'Bo', 'Cy']);
  });

  it('editing a value commits the complete list, in order', () => {
    const onCommitListValue = renderPeople('active');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Ana' }));
    const edit = screen.getByRole('textbox', { name: 'Edit Ana' });
    fireEvent.change(edit, { target: { value: 'Anna' } });
    fireEvent.keyDown(edit, { key: 'Enter' });

    expect(onCommitListValue).toHaveBeenCalledExactlyOnceWith('people', ['Anna', 'Bo']);
  });

  it('removing a value commits the complete list', () => {
    const onCommitListValue = renderPeople('active');

    fireEvent.click(screen.getByRole('button', { name: 'Remove Ana' }));

    expect(onCommitListValue).toHaveBeenCalledExactlyOnceWith('people', ['Bo']);
  });

  it('an archived page shows the pills with no editor and no commit', () => {
    const onCommitListValue = renderPeople('archived');

    expect(pills()).toEqual(['Ana', 'Bo']);
    expect(screen.queryByRole('textbox', { name: 'people' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Ana' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove Ana' })).toBeNull();
    expect(onCommitListValue).not.toHaveBeenCalled();
  });
});
