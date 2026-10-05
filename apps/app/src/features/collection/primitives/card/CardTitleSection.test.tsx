// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CardTitleSection } from './CardTitleSection';

afterEach(cleanup);

const root = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe('CardTitleSection', () => {
  it('renders a bare title as just the title row', () => {
    const { container } = render(<CardTitleSection title="Plan" />);

    expect(screen.getByText('Plan')).toHaveClass('cx-card-title-section__title');
    expect(container.querySelector('.cx-card-title-section__leading')).toBeNull();
    expect(container.querySelector('.cx-card-title-section__description')).toBeNull();
    expect(container.querySelector('.cx-card-title-section__metadata')).toBeNull();
  });

  it('renders nothing for a part that is not supplied', () => {
    const { container } = render(<CardTitleSection />);

    expect(root(container)).toBeEmptyDOMElement();
  });

  it('draws the icon through AppIcon, in the leading box', () => {
    const { container } = render(<CardTitleSection icon="note" title="Plan" />);

    const leading = container.querySelector('.cx-card-title-section__leading')!;
    expect(leading.querySelector('.app-icon svg')).not.toBeNull();
    expect(leading.querySelector('.emoji-icon')).toBeNull();
  });

  it('draws the emoji instead of the icon when both are given', () => {
    const { container } = render(<CardTitleSection icon="note" emoji="🌊" title="Plan" />);

    const leading = container.querySelector('.cx-card-title-section__leading')!;
    expect(leading.querySelector('.emoji-icon')).toHaveTextContent('🌊');
    expect(leading.querySelector('svg')).toBeNull();
  });

  it('titleContent replaces the plain title inside the same title row', () => {
    render(<CardTitleSection title="Plan" titleContent={<input aria-label="Rename" />} />);

    const field = screen.getByLabelText('Rename');
    expect(field.parentElement).toHaveClass('cx-card-title-section__title');
    expect(screen.queryByText('Plan')).toBeNull();
  });

  it('shows the description on its own line', () => {
    render(<CardTitleSection title="Plan" description="Q4 goals" />);

    expect(screen.getByText('Q4 goals')).toHaveClass('cx-card-title-section__description');
  });

  it('renders each metadata entry as its own item; a label/value entry draws both parts', () => {
    const { container } = render(
      <CardTitleSection title="Plan" metadata={['Edited today', { label: 'Size', value: '4 MB' }]} />
    );

    const items = container.querySelectorAll('.cx-card-title-section__metadata-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Edited today');
    expect(items[1]!.querySelector('.cx-card-title-section__metadata-label')).toHaveTextContent('Size');
    expect(items[1]!.querySelector('.cx-card-title-section__metadata-value')).toHaveTextContent('4 MB');
  });

  it('lays metadata out horizontally by default and vertically on request', () => {
    const { container, rerender } = render(<CardTitleSection title="Plan" metadata={['a', 'b']} />);
    expect(container.querySelector('.cx-card-title-section__metadata')).toHaveClass(
      'cx-card-title-section__metadata--horizontal'
    );

    rerender(<CardTitleSection title="Plan" metadata={['a', 'b']} metadataLayout="vertical" />);
    expect(container.querySelector('.cx-card-title-section__metadata')).toHaveClass(
      'cx-card-title-section__metadata--vertical'
    );
  });

  it('reserves metadata height: min lines show even with fewer items or none', () => {
    const { container, rerender } = render(<CardTitleSection title="Plan" minMetadataLines={2} />);
    let metadata = container.querySelector('.cx-card-title-section__metadata') as HTMLElement;
    expect(metadata).not.toBeNull();
    expect(metadata.style.getPropertyValue('--cx-card-title-section-min-lines')).toBe('2');
    expect(metadata.children).toHaveLength(0);

    rerender(<CardTitleSection title="Plan" metadata={['a']} minMetadataLines={2} />);
    metadata = container.querySelector('.cx-card-title-section__metadata') as HTMLElement;
    expect(metadata.style.getPropertyValue('--cx-card-title-section-min-lines')).toBe('2');
    expect(metadata.children).toHaveLength(1);
  });

  it('reserves nothing by default', () => {
    const { container } = render(<CardTitleSection title="Plan" metadata={['a']} />);

    const metadata = container.querySelector('.cx-card-title-section__metadata') as HTMLElement;
    expect(metadata.style.getPropertyValue('--cx-card-title-section-min-lines')).toBe('0');
  });

  it('adds a className to the root', () => {
    const { container } = render(<CardTitleSection title="Plan" className="mine" />);

    expect(root(container)).toHaveClass('cx-card-title-section', 'mine');
  });
});
