// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { CurrentNoteTemplateSuggestions } from './CurrentNoteTemplateSuggestions';

const template = (id: string, name: string) =>
  ({ id, type: 'note', icon: 'template', emoji: null, selected: false, onClick: vi.fn(), values: { name } }) as CollectionEntryModel;

const templates = ['A', 'B', 'C', 'D'].map((name) => template(`id-${name}`, name));

beforeEach(() => {
  // No layout in jsdom: every entry is 100px wide and the row 250px, so two templates and "+2 more" show.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.tagName === 'SPAN' ? 0 : 100;
    return { width, height: 20, top: 0, left: 0, right: width, bottom: 20, x: 0, y: 0, toJSON: () => ({}) };
  });
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ columnGap: '10px' } as CSSStyleDeclaration);
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 340 });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // @ts-expect-error — remove the test's own override
  delete HTMLElement.prototype.clientWidth;
});

const setup = () => {
  const onApply = vi.fn();
  const onCreateTemplate = vi.fn();
  render(<CurrentNoteTemplateSuggestions templates={templates} onApply={onApply} onCreateTemplate={onCreateTemplate} />);

  return { onApply, onCreateTemplate };
};

describe('CurrentNoteTemplateSuggestions', () => {
  it('applies a visible template by its page id', () => {
    const { onApply } = setup();

    fireEvent.click(screen.getByText('B'));

    expect(onApply).toHaveBeenCalledWith('id-B');
  });

  it('"+N more" opens the template picker (New template row, every template) without applying anything', () => {
    const { onApply, onCreateTemplate } = setup();

    fireEvent.click(screen.getByText('+2 more'));

    expect(screen.getByPlaceholderText('Search templates')).toBeInTheDocument();
    expect(screen.getByText('New template')).toBeInTheDocument();
    expect(screen.getAllByText('D').length).toBeGreaterThan(0);
    expect(onApply).not.toHaveBeenCalled();
    expect(onCreateTemplate).not.toHaveBeenCalled();
  });

  it('choosing a template in the picker applies it to the current note and closes the picker', () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByText('+2 more'));

    const rows = screen.getAllByText('D');
    fireEvent.click(rows[rows.length - 1]!);

    expect(onApply).toHaveBeenCalledWith('id-D');
    expect(screen.queryByPlaceholderText('Search templates')).toBeNull();
  });

  it('the picker\'s New template row creates a template, not an applied note', () => {
    const { onApply, onCreateTemplate } = setup();
    fireEvent.click(screen.getByText('+2 more'));

    fireEvent.click(screen.getByText('New template'));

    expect(onCreateTemplate).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });
});
