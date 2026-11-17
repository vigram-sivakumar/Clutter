import React, { useState, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { formatColors } from '@clutter/editor/browser';
function Toolbar({ menu, position }) {
  useLayoutEffect(position);
  const [linkOpen, setLinkOpen] = useState(false),
    [href, setHref] = useState(''),
    [error, setError] = useState('');
  const applyLink = (event) => {
    event.preventDefault();
    try {
      if (menu.apply('link', href || null)) {
        setError('');
        setLinkOpen(false);
      }
    } catch {
      setError('Enter an http, https or mailto link.');
    }
  };
  const preserve = (event) => event.preventDefault();
  return React.createElement(
    'div',
    {
      className: 'formatting-toolbar',
      role: 'toolbar',
      'aria-label': 'Text formatting',
      onKeyDown: (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          menu.dismiss();
        }
      },
    },
    ...[
      ['bold', 'Bold', 'B'],
      ['italic', 'Italic', 'I'],
      ['underline', 'Underline', 'U'],
      ['strike', 'Strikethrough', 'S'],
    ].map(([id, label, text]) =>
      React.createElement(
        'button',
        {
          key: id,
          type: 'button',
          'aria-label': label,
          'aria-pressed': !!menu.values[id],
          onPointerDown: preserve,
          onMouseDown: preserve,
          onClick: () => menu.apply(id),
        },
        text
      )
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        'aria-label': 'Link',
        'aria-pressed': !!menu.values.link,
        onPointerDown: preserve,
        onMouseDown: preserve,
        onClick: () => {
          setHref(menu.values.link ?? '');
          setError('');
          setLinkOpen(!linkOpen);
        },
      },
      'Link'
    ),
    ...[
      ['text_color', 'Text colour'],
      ['highlight', 'Text highlight'],
      ['background', 'Block background'],
    ].map(([id, label]) =>
      React.createElement(
        'label',
        { key: id },
        label,
        React.createElement(
          'select',
          {
            'aria-label': label,
            value: menu.values[id] ?? '',
            onChange: (event) => menu.apply(id, event.target.value || null),
          },
          React.createElement('option', { value: '' }, 'Default'),
          ...formatColors.map((color) =>
            React.createElement(
              'option',
              { key: color.id, value: color.id },
              color.id[0].toUpperCase() + color.id.slice(1)
            )
          )
        )
      )
    ),
    linkOpen &&
      React.createElement(
        'form',
        { onSubmit: applyLink, 'aria-label': 'Edit link' },
        React.createElement('input', {
          'aria-label': 'Link URL',
          value: href,
          onChange: (event) => setHref(event.target.value),
          placeholder: 'https://example.com',
          type: 'text',
        }),
        React.createElement('button', { type: 'submit' }, 'Apply link'),
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => {
              menu.apply('link', null);
              setLinkOpen(false);
            },
          },
          'Remove link'
        ),
        error && React.createElement('span', { role: 'alert' }, error)
      )
  );
}
// Chrome only: view model contains selection geometry/actions, never document state.
export function renderFormattingToolbar({ document }) {
  const host = document.createElement('div');
  host.className = 'formatting-toolbar-host';
  host.hidden = true;
  document.body.append(host);
  const root = createRoot(host);
  return {
    contains: (node) => host.contains(node),
    hasFocus: () => host.contains(document.activeElement),
    update(menu) {
      host.hidden = !menu;
      if (!menu) {
        root.render(null);
        return;
      }
      const position = () => {
        const rect = host.getBoundingClientRect(),
          width = rect.width || 680,
          height = rect.height || 48;
        host.style.left =
          Math.max(
            8,
            Math.min(
              (menu.rect.left + menu.rect.right - width) / 2,
              (document.defaultView?.innerWidth ?? 1000) - width - 8
            )
          ) + 'px';
        host.style.top = Math.max(8, menu.rect.top - height - 8) + 'px';
      };
      root.render(React.createElement(Toolbar, { menu, position }));
    },
    destroy() {
      root.unmount();
      host.remove();
    },
  };
}
