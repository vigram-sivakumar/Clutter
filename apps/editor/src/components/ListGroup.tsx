import type { ReactNode } from 'react';
import '.././styles/list-group.css';
import { ListItem } from './items/ListItem';

type ListGroupProps = {
  children?: ReactNode;
  title?: ReactNode;

  collapsible?: boolean;
};

export function ListGroup({
  children,
  title,
  collapsible = false,
}: ListGroupProps) {
  return (
    <section className="list-group">
      {title && (
        <ListItem
          labelStyle="label"
          onClick={collapsible ? () => {} : undefined}
        >
          {title}
        </ListItem>
      )}
      <div className="list-items">{children}</div>
    </section>
  );
}
