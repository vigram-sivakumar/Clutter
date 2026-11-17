import React from 'react';
import { createRoot } from 'react-dom/client';
// React owns menu chrome outside PM's editable DOM. The adapter only receives
// commands/range geometry, never a copied document or a persistence callback.
export function renderSlashMenu({ document }) {
  const host = document.createElement('div');
  host.className = 'slash-menu-host';
  document.body.append(host);
  const root = createRoot(host);
  return {
    contains: (node) => host.contains(node),
    update(menu) {
      host.hidden = !menu;
      if (!menu) {
        root.render(null);
        return;
      }
      host.style.left =
        Math.max(
          8,
          Math.min(menu.left, (document.defaultView?.innerWidth ?? 800) - 248)
        ) + 'px';
      host.style.top =
        Math.max(
          8,
          Math.min(
            menu.top + 6,
            (document.defaultView?.innerHeight ?? 600) - 300
          )
        ) + 'px';
      root.render(
        React.createElement(
          'div',
          {
            className: 'slash-menu',
            role: 'listbox',
            'aria-label': 'Insert block',
          },
          menu.items.map((item, index) =>
            React.createElement(
              'button',
              {
                key: item.id,
                type: 'button',
                role: 'option',
                'aria-selected': index === menu.selected,
                onMouseDown: (event) => event.preventDefault(),
                onPointerDown: (event) => event.preventDefault(),
                onClick: () => menu.choose(item.id),
              },
              item.label
            )
          )
        )
      );
    },
    destroy() {
      root.unmount();
      host.remove();
    },
  };
}
