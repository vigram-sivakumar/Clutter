// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { EffectivePage } from '@core/application/page/EffectivePageState';
import type { PageOperations } from '@core/application/page/PageOperations';

import { Templates } from './Sidebar.Templates';

// The row, its actions and the resolvers are the Notes sidebar's own; this panel only decides which pages
// are listed and what a click does.
vi.mock('@features/notes/sidebar/FolderTree', () => ({
  PageEntry: ({ entry, onPageClick }: { entry: EffectivePage; onPageClick(id: string): void }) => (
    <button onClick={() => onPageClick(entry.id)}>{entry.name}</button>
  ),
}));
vi.mock('@features/notes/helpers/buildNoteRowActions', () => ({ buildNoteRowActions: () => ({}) }));
vi.mock('@app/layouts/createTemplate/CreateTemplateProvider', () => ({ useRequestCreateTemplate: () => vi.fn() }));
vi.mock('@components/toast/ToastProvider', () => ({ useToast: () => ({}) }));
vi.mock('@app/layouts/page/resolvePageEmbed', () => ({ createPageEmbedResolver: () => vi.fn() }));
vi.mock('@app/layouts/page/resolveTag', () => ({ createTagResolver: () => vi.fn() }));
vi.mock('@app/layouts/page/resolveWikiLink', () => ({ createWikiLinkResolver: () => vi.fn() }));

afterEach(cleanup);

const page = (id: string, name: string) => ({ id, name }) as EffectivePage;

function renderPanel({
  pagesByFolder = {},
  foldersByFolder = {},
  hasTemplatesFolder = true,
  open = vi.fn(),
  onRequestNewTemplate = vi.fn(),
}: {
  pagesByFolder?: Record<string, EffectivePage[]>;
  foldersByFolder?: Record<string, { id: string }[]>;
  hasTemplatesFolder?: boolean;
  open?: ReturnType<typeof vi.fn>;
  onRequestNewTemplate?: () => void;
}) {
  const membershipSelector = {
    getTemplatesFolder: () => (hasTemplatesFolder ? { id: 'templates' } : undefined),
    getVisibleChildPages: (id: string) => pagesByFolder[id] ?? [],
    getVisibleChildFolders: (id: string) => foldersByFolder[id] ?? [],
  } as unknown as MembershipSelector;

  render(
    <Templates
      vault={{} as never}
      navigation={{} as never}
      pageOperations={{ open } as unknown as PageOperations}
      folderOperations={{} as never}
      effectivePageState={{} as never}
      membershipSelector={membershipSelector}
      workspace={{ activePageId: null } as never}
      onRequestNewTemplate={onRequestNewTemplate}
    />
  );
}

describe('Templates sidebar panel', () => {
  it('lists the templates, subfolders included, by name', () => {
    renderPanel({
      pagesByFolder: {
        templates: [page('m', 'Meeting'), page('a', 'Agenda')],
        nested: [page('j', 'Journal')],
      },
      foldersByFolder: { templates: [{ id: 'nested' }] },
    });

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'New',
      'Agenda',
      'Journal',
      'Meeting',
    ]);
  });

  it('opens a template when its row is clicked', () => {
    const open = vi.fn();
    renderPanel({ pagesByFolder: { templates: [page('m', 'Meeting')] }, open });

    fireEvent.click(screen.getByText('Meeting'));

    expect(open).toHaveBeenCalledWith('m');
  });

  it('New asks to create a template', () => {
    const onRequestNewTemplate = vi.fn();
    renderPanel({ onRequestNewTemplate });

    fireEvent.click(screen.getByText('New'));

    expect(onRequestNewTemplate).toHaveBeenCalledTimes(1);
  });

  it('shows only New when there is no Templates folder', () => {
    renderPanel({ hasTemplatesFolder: false });

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['New']);
  });
});
