// @vitest-environment jsdom

import { cleanup, render, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Section } from './Section';

afterEach(() => {
  cleanup();
});

describe('Section — isEmpty default expansion', () => {
  it('a non-empty section defaults expanded', () => {
    const { queryByText } = render(
      <Section hasHeader title="Today" isCollapsible isEmpty={false} isExpanded={true}>
        <div>SECTION CONTENT</div>
      </Section>
    );

    expect(queryByText('SECTION CONTENT')).not.toBeNull();
  });

  it('an empty section defaults collapsed even though Workspace has no stored preference (reads expanded=true)', () => {
    const { queryByText } = render(
      <Section hasHeader title="Today" isCollapsible isEmpty={true} isExpanded={true}>
        <div>SECTION CONTENT</div>
      </Section>
    );

    expect(queryByText('SECTION CONTENT')).toBeNull();
  });

  it('an empty section remains fully interactive — first click expands it, immediately, no wasted click', () => {
    let expanded = true; // Workspace default: never-toggled reads as expanded
    const setExpanded = (next: boolean) => {
      expanded = next;
    };

    function Wrapper() {
      return (
        <Section
          hasHeader
          title="Today"
          isCollapsible
          isEmpty={true}
          isExpanded={expanded}
          onExpandedChange={setExpanded}
        >
          <div>SECTION CONTENT</div>
        </Section>
      );
    }

    const { rerender, container, queryByText } = render(<Wrapper />);
    expect(queryByText('SECTION CONTENT')).toBeNull();

    const caret = container.querySelector('.section-header__caret') as HTMLElement;
    fireEvent.click(caret);
    rerender(<Wrapper />);

    expect(queryByText('SECTION CONTENT')).not.toBeNull();
  });

  it('an empty section can be collapsed again after being explicitly expanded — not stuck open either', () => {
    let expanded = true;
    const setExpanded = (next: boolean) => {
      expanded = next;
    };

    function Wrapper() {
      return (
        <Section
          hasHeader
          title="Today"
          isCollapsible
          isEmpty={true}
          isExpanded={expanded}
          onExpandedChange={setExpanded}
        >
          <div>SECTION CONTENT</div>
        </Section>
      );
    }

    const { rerender, container, queryByText } = render(<Wrapper />);
    const caret = container.querySelector('.section-header__caret') as HTMLElement;

    fireEvent.click(caret); // expand
    rerender(<Wrapper />);
    expect(queryByText('SECTION CONTENT')).not.toBeNull();

    fireEvent.click(caret); // collapse
    rerender(<Wrapper />);
    expect(queryByText('SECTION CONTENT')).toBeNull();
  });

  it('header click (navigation) still fires while a section is empty and force-collapsed', () => {
    const onClick = vi.fn();

    const { getByText } = render(
      <Section
        hasHeader
        title="Today"
        isCollapsible
        isEmpty={true}
        isExpanded={true}
        onClick={onClick}
      >
        <div>SECTION CONTENT</div>
      </Section>
    );

    fireEvent.click(getByText('Today'));
    expect(onClick).toHaveBeenCalled();
  });
});
