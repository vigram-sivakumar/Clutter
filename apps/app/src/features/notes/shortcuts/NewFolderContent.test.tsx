// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { NewFolderContent } from './NewFolderContent';
import { CREATE_TEMPLATE_LABELS } from '../helpers/createTemplateFromPage';

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

function setup(canCreate = () => true) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(<NewFolderContent onClose={onClose} canCreate={canCreate} onSubmit={onSubmit} />);

  return { onSubmit, onClose };
}

describe('NewFolderContent', () => {
  it('has a description field with only the placeholder, and an emoji button', () => {
    setup();

    expect(screen.getByPlaceholderText('Description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose emoji' })).toBeInTheDocument();
  });

  it('Create is always enabled, and a duplicate name is refused without submitting', () => {
    const { onSubmit } = setup((() => false) as () => boolean);
    const create = screen.getByRole('button', { name: 'Create' });
    expect(create).toBeEnabled();

    fireEvent.change(screen.getByPlaceholderText('New folder'), { target: { value: 'Work' } });

    expect(create).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('already exists');
    fireEvent.click(create);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('Create with the name %j submits nothing, shakes the name input itself, and keeps the dialog open', (typed) => {
    const { onSubmit, onClose } = setup();
    const field = screen.getByPlaceholderText('New folder');
    fireEvent.change(field, { target: { value: typed } });

    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(field.tagName).toBe('INPUT');
    expect(field).toHaveClass('editable-text--shake');
    expect(field.closest('.input')).not.toHaveClass('editable-text--shake');
    expect(field.closest('form')).not.toHaveClass('editable-text--shake');
  });

  it('after an empty attempt, a valid name then creates the folder', async () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('New folder'), { target: { value: 'Work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Work', undefined, undefined));
  });

  it('submits the name with no icon or description by default', async () => {
    const { onSubmit, onClose } = setup();

    fireEvent.change(screen.getByPlaceholderText('New folder'), { target: { value: 'Work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Work', undefined, undefined));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('submits a trimmed description', async () => {
    const { onSubmit } = setup();

    fireEvent.change(screen.getByPlaceholderText('New folder'), { target: { value: 'Work' } });
    fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: '  Client notes ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Work', undefined, 'Client notes'));
  });
});

// "Create template" is this same dialog, configured (labels, prefilled values, no icon, Cancel).
describe('NewFolderContent — configured as Create template', () => {
  function setupTemplate(overrides: { canCreate?: (name: string) => boolean; initialName?: string; initialDescription?: string } = {}) {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <NewFolderContent
        onClose={onClose}
        canCreate={overrides.canCreate ?? (() => true)}
        onSubmit={onSubmit}
        labels={CREATE_TEMPLATE_LABELS}
        initialName={overrides.initialName ?? 'Weekly review'}
        initialDescription={overrides.initialDescription ?? 'Every Friday'}
        withIcon={false}
        withCancel
      />
    );
    return { onSubmit, onClose };
  }

  it('is titled "Create template" with a name field, a description field, Cancel and a "Create template" CTA — and no emoji picker', () => {
    setupTemplate();

    expect(screen.getByText('Create template', { selector: '.new-folder__title' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Template name' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Description' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create template' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose emoji' })).toBeNull();
  });

  it('is prefilled with the source\'s name and description, both editable', async () => {
    const { onSubmit } = setupTemplate();
    const name = screen.getByRole('textbox', { name: 'Template name' }) as HTMLInputElement;
    const description = screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement;

    expect(name.value).toBe('Weekly review');
    expect(description.value).toBe('Every Friday');

    fireEvent.change(name, { target: { value: 'Review template' } });
    fireEvent.change(description, { target: { value: 'Use each week' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create template' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Review template', undefined, 'Use each week'));
  });

  it('a source with no description starts with an empty field, and submits no description', async () => {
    const { onSubmit } = setupTemplate({ initialDescription: '' });

    expect((screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Create template' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Weekly review', undefined, undefined));
  });

  it('the CTA stays enabled for a blank name (which shakes instead of submitting), and a duplicate template name is refused with a template-worded error', () => {
    const blank = setupTemplate({ initialName: '' });
    expect(screen.getByRole('button', { name: 'Create template' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Create template' }));
    expect(blank.onSubmit).not.toHaveBeenCalled();
    cleanup();

    setupTemplate({ canCreate: () => false });
    expect(screen.getByRole('button', { name: 'Create template' })).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('A template named “Weekly review” already exists');
  });

  it('Cancel closes without submitting', () => {
    const { onSubmit, onClose } = setupTemplate();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('the New folder dialog is unchanged: no Cancel button, an emoji picker, "Create"', () => {
    setup();

    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose emoji' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });
});
