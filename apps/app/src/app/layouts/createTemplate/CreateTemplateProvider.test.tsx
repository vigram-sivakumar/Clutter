// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Application } from '@core/application/Application';
import { CreateTemplateProvider, useRequestCreateTemplate } from './CreateTemplateProvider';

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

function fakeApplication(
  source: { type: 'note' | 'daily-note'; name: string; description: string | null; markdown: string },
  existingTemplateNames: string[] = []
) {
  const create = vi.fn().mockResolvedValue('new-template-id');
  const open = vi.fn();
  const openPage = vi.fn();
  const application = {
    effectivePageState: { getPage: () => ({ id: 'src', isTemplate: false, ...source }) },
    vault: { getReservedFolder: () => ({ id: 'templates', path: '/vault/Templates' }) },
    pageOperations: {
      create,
      open,
      canCreate: (_folderId: string, name: string) => !existingTemplateNames.includes(name),
    },
    folderOperations: { ensureReservedFolder: vi.fn().mockResolvedValue({ id: 'templates' }) },
    workspace: { openPage },
  } as unknown as Application;

  return { application, create, open, openPage };
}

function Trigger() {
  const request = useRequestCreateTemplate();
  return <button onClick={() => request?.('src')}>ask</button>;
}

function renderProvider(application: Application) {
  render(
    <CreateTemplateProvider application={application}>
      <Trigger />
    </CreateTemplateProvider>
  );
  fireEvent.click(screen.getByText('ask'));
}

describe('CreateTemplateProvider — the one Create template dialog', () => {
  it('opens the dialog prefilled from a Note\'s title and description', () => {
    const { application } = fakeApplication({ type: 'note', name: 'Weekly review', description: 'Every Friday', markdown: 'x' });
    renderProvider(application);

    expect((screen.getByRole('textbox', { name: 'Template name' }) as HTMLInputElement).value).toBe('Weekly review');
    expect((screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).value).toBe('Every Friday');
  });

  it('prefills a Daily Note with the generic name instead of its date', () => {
    const { application } = fakeApplication({ type: 'daily-note', name: '2026-10-07', description: null, markdown: 'x' });
    renderProvider(application);

    expect((screen.getByRole('textbox', { name: 'Template name' }) as HTMLInputElement).value).toBe('Daily Note Template');
    expect((screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).value).toBe('');
  });

  it('creates the template from the edited values, in Templates, without activating or navigating — then closes', async () => {
    const { application, create, open, openPage } = fakeApplication({
      type: 'note',
      name: 'Weekly review',
      description: null,
      markdown: '# Review',
    });
    renderProvider(application);

    fireEvent.change(screen.getByRole('textbox', { name: 'Template name' }), { target: { value: 'Review template' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'Weekly' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create template' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        folderId: 'templates',
        title: 'Review template',
        body: '# Review',
        description: 'Weekly',
        activate: false,
      })
    );
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Template name' })).toBeNull());
    // The user stays where they were.
    expect(open).not.toHaveBeenCalled();
    expect(openPage).not.toHaveBeenCalled();
  });

  it('Cancel creates nothing', () => {
    const { application, create } = fakeApplication({ type: 'note', name: 'N', description: null, markdown: '' });
    renderProvider(application);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(create).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Template name' })).toBeNull();
  });

  it('refuses a name already used by a template in Templates', () => {
    const { application, create } = fakeApplication(
      { type: 'note', name: 'Weekly review', description: null, markdown: '' },
      ['Weekly review']
    );
    renderProvider(application);

    expect(screen.getByRole('button', { name: 'Create template' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('already exists');
    expect(create).not.toHaveBeenCalled();
  });

  it('outside the provider there is no handler (a surface never gets a live control that does nothing)', () => {
    function Probe() {
      return <span>{useRequestCreateTemplate() === undefined ? 'none' : 'some'}</span>;
    }
    render(<Probe />);
    expect(screen.getByText('none')).toBeInTheDocument();
  });
});
