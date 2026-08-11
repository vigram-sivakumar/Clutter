import type { ReactNode } from 'react';
import { PropertyList } from '@components/property-list/PropertyList';
import './Page.Body.css';

interface PageBodyProps {
  children: ReactNode;
  className?: string;
}

/**
 * Layout container for page body content.
 *
 * Responsibilities:
 * - Provide consistent page body layout.
 * - Apply page body styling.
 * - Render arbitrary child content.
 *
 * This component intentionally does not implement editing behavior.
 * Editable experiences should be composed by higher-level components.
 */
export function PageBody({ children, className }: PageBodyProps) {
  return (
    <div className={['page-content', className].filter(Boolean).join(' ')}>
      <PropertyList
        items={[
          { name: 'Title', type: 'text', value: 'Example note' },
          { name: 'Published', type: 'boolean', value: true },
          { name: 'Website', type: 'url', value: 'https://example.com' },
          { name: 'Tags', type: 'multi-select', value: 'Design, UX' },
          { name: 'Tags', type: 'multi-select', value: '' },
        ]}
      />
      {children}
    </div>
  );
}
