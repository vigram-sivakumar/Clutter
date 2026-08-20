import { WidgetType, type EditorView } from '@codemirror/view';

import '@components/checkbox/Checkbox.css';

/**
 * The at-rest rendered form of a task's `[ ]`/`[x]` marker — a vanilla-DOM
 * adapter over `Checkbox.tsx`'s own design, not a mount of that React
 * component: every widget in this codebase (`WikiLinkWidget`, `TagWidget`,
 * `DateWidget`) builds plain DOM in `toDOM()`, and `Checkbox` additionally
 * depends on `AppIcon`'s SVGR (`?react`) icon imports, a React-only
 * construction path. This reuses the actually-shared layer instead —
 * `Checkbox.css`'s own classes (`checkbox`/`checkbox--checked`), imported
 * directly so the two never drift — and inlines the same two icon SVGs'
 * markup (`shared/icon/svg/checkbox-{un,}checked.svg`), copied once since
 * they're static, trusted, already-bundled assets with no reactive data.
 *
 * `role="checkbox"`/`aria-checked` mirror `Checkbox.tsx`'s own ARIA shape
 * (§6 baseline, same caveat as `WikiLinkWidget`'s doc comment: not a final
 * accessibility design, just parity with the existing component).
 */
const UNCHECKED_ICON_PATH =
  'M6 0.6H10C12.982 0.6 15.4 3.582 15.4 6V10C15.4 12.418 12.982 15.4 10 15.4H6C3.582 15.4 0.6 12.418 0.6 10V6C0.6 3.582 3.582 0.6 6 0.6Z';
const CHECKED_ICON_OUTER_PATH =
  'M5.4 0H10.6C13.582 0 16 2.982 16 5.4V10.6C16 13.018 13.582 16 10.6 16H5.4C2.982 16 0 13.018 0 10.6V5.4C0 2.982 2.982 0 5.4 0Z';
const CHECKED_ICON_TICK_PATH = 'M5 8.42857L6.8 11L11 5';

const SVG_NS = 'http://www.w3.org/2000/svg';

function buildIcon(checked: boolean): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');

  if (checked) {
    const outer = document.createElementNS(SVG_NS, 'path');
    outer.setAttribute('d', CHECKED_ICON_OUTER_PATH);
    outer.setAttribute('fill', 'currentColor');
    svg.appendChild(outer);

    const tick = document.createElementNS(SVG_NS, 'path');
    tick.setAttribute('d', CHECKED_ICON_TICK_PATH);
    tick.setAttribute('stroke', 'var(--icon-on-accent, #FFF)');
    tick.setAttribute('stroke-linecap', 'round');
    tick.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(tick);
  } else {
    const outline = document.createElementNS(SVG_NS, 'path');
    outline.setAttribute('d', UNCHECKED_ICON_PATH);
    outline.setAttribute('stroke', 'currentColor');
    svg.appendChild(outline);
  }

  return svg;
}

export class TaskCheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  override eq(other: TaskCheckboxWidget): boolean {
    return this.checked === other.checked;
  }

  override toDOM(_view: EditorView): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'checkbox');
    button.setAttribute('aria-checked', String(this.checked));
    button.className = this.checked ? 'checkbox checkbox--checked' : 'checkbox';
    button.appendChild(buildIcon(this.checked));
    return button;
  }

  /**
   * Same reasoning as `WikiLinkWidget.ignoreEvent` — `mousedown` must pass
   * through so `tokenMouseHandlers.ts`'s handler (wired at the editor
   * level, not here) actually receives the click; every other event type
   * keeps CM6's own default.
   */
  override ignoreEvent(event: Event): boolean {
    return event.type !== 'mousedown';
  }
}
