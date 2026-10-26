import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { iconRegistry } from './iconRegistry';
import type { SystemIcon } from './types';

const DEFAULT_SIZE = 16;
const DEFAULT_STROKE_WIDTH = 1.2;

const markupByIcon = new Map<SystemIcon, string>();

/**
 * A system icon as `<svg>` markup, for the raw-DOM surfaces `AppIcon` (a React component) cannot mount in —
 * a CodeMirror widget, a completion popup row. It renders the SAME `iconRegistry` component `AppIcon`
 * renders, at `AppIcon`'s own default size and stroke, so there is no second icon mapping: whatever an icon
 * name means everywhere else is what it draws here. Drawn in `currentColor`, like the registry's SVGs.
 * Memoized — an icon's markup never changes.
 */
export function systemIconSvg(icon: SystemIcon): string {
  let markup = markupByIcon.get(icon);

  if (markup === undefined) {
    const Icon = iconRegistry[icon];
    markup = renderToStaticMarkup(
      createElement(Icon, { width: DEFAULT_SIZE, height: DEFAULT_SIZE, strokeWidth: DEFAULT_STROKE_WIDTH })
    );
    markupByIcon.set(icon, markup);
  }

  return markup;
}
