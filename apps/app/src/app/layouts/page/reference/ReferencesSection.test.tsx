// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ReferencesSection } from './ReferencesSection';

afterEach(() => {
  cleanup();
});

describe('ReferencesSection', () => {
  it('is one section named References, with two groups: Tasks, then Notes and Daily Notes', () => {
    render(<ReferencesSection />);

    const section = screen.getByRole('region', { name: 'References' });
    const groups = within(section).getAllByRole('group');

    expect(groups.map((group) => group.getAttribute('aria-labelledby'))).toHaveLength(2);
    expect(groups[0]).toHaveAccessibleName('Tasks');
    expect(groups[1]).toHaveAccessibleName('Notes and Daily Notes');
    // Document order is the order shown.
    expect(groups[0]!.compareDocumentPosition(groups[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the headings and nothing else when no data is supplied — no placeholder items', () => {
    const { container } = render(<ReferencesSection />);

    expect(container.querySelectorAll('.references-section__group')).toHaveLength(2);
    expect(container.querySelectorAll('.references-section__heading')).toHaveLength(2);
    expect(container.textContent).toBe('TasksNotes and Daily Notes');
  });

  it('renders what it is given in the matching group, and only there', () => {
    render(<ReferencesSection tasks={<span>a task</span>} notes={<span>a note</span>} />);

    const [tasks, notes] = screen.getAllByRole('group');

    expect(within(tasks!).getByText('a task')).toBeInTheDocument();
    expect(within(tasks!).queryByText('a note')).toBeNull();
    expect(within(notes!).getByText('a note')).toBeInTheDocument();
    expect(within(notes!).queryByText('a task')).toBeNull();
  });

  it('gives each instance its own heading ids', () => {
    render(
      <>
        <ReferencesSection />
        <ReferencesSection />
      </>
    );

    const ids = screen.getAllByRole('group').map((group) => group.getAttribute('aria-labelledby'));

    expect(new Set(ids).size).toBe(4);
  });

  it('is plain structure: it takes no click or state of its own', () => {
    const { container } = render(<ReferencesSection />);

    expect(container.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0);
  });
});
