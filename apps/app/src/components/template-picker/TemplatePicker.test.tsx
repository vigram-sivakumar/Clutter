// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { NEW_TEMPLATE_ID, TemplatePicker, templateItems } from './TemplatePicker';

const template = (id: string, name: string, emoji: string | null = null) =>
  ({ id, type: 'note', icon: 'template', emoji, selected: false, onClick: vi.fn(), values: { name } }) as CollectionEntryModel;

const templates = [template('a', 'Meeting', '📅'), template('b', 'Journal')];

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(open = true) {
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  const props = {
    onClose: vi.fn(),
    onSelectTemplate: vi.fn(),
    onNewTemplate: vi.fn(),
  };
  render(
    <TemplatePicker
      anchorRef={{ current: anchor } as ReturnType<typeof createRef<HTMLElement>>}
      open={open}
      templates={templates}
      {...props}
    />
  );

  return props;
}

describe('templateItems', () => {
  it('leads with the New template row, then one flat row per template, with the Default pill on the default', () => {
    const items = templateItems(templates, 'b');

    expect(items.map((item) => item.id)).toEqual([NEW_TEMPLATE_ID, 'a', 'b']);
    expect(items[1]).toMatchObject({ title: 'Meeting', emoji: '📅', level: 0, parentId: null });
    expect(items[2]).toMatchObject({ pill: 'Default' });
    expect(items[1]).not.toHaveProperty('pill');
  });
});

describe('TemplatePicker', () => {
  it('shows nothing while closed', () => {
    setup(false);

    expect(screen.queryByPlaceholderText('Search templates')).toBeNull();
  });

  it('lists the New template row and every template when open', () => {
    setup();

    expect(screen.getByPlaceholderText('Search templates')).toBeInTheDocument();
    expect(screen.getByText('New template')).toBeInTheDocument();
    expect(screen.getByText('Meeting')).toBeInTheDocument();
    expect(screen.getByText('Journal')).toBeInTheDocument();
  });

  it('reports the chosen template id and does not close itself (the caller does)', () => {
    const { onSelectTemplate, onNewTemplate, onClose } = setup();

    fireEvent.click(screen.getByText('Journal'));

    expect(onSelectTemplate).toHaveBeenCalledWith('b');
    expect(onNewTemplate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the New template row calls onNewTemplate, not onSelectTemplate', () => {
    const { onSelectTemplate, onNewTemplate } = setup();

    fireEvent.click(screen.getByText('New template'));

    expect(onNewTemplate).toHaveBeenCalledTimes(1);
    expect(onSelectTemplate).not.toHaveBeenCalled();
  });

  it('dismisses through onClose (Escape)', () => {
    const { onClose } = setup();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });
});
