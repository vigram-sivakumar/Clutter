import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Entry } from '@components/entry/Entry';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { computeVisibleTemplateCount } from './visibleTemplateCount';
import './TemplateSuggestions.css';
import { AppIcon } from '@shared/icon';

export interface TemplateSuggestionsProp {
  /** The templates to suggest, in display order — the same entry model the From template list uses. */
  templates: readonly CollectionEntryModel[];
  /** Called with the clicked template; the entry's own `onClick` (which creates a new note) is never used. */
  onSelect: (template: CollectionEntryModel) => void;
  /**
   * Called when the "+N more" entry is clicked, with that entry so the caller can anchor the template
   * picker to it. It only asks to open the picker; it never creates anything.
   */
  onOverflowClick: (anchor: HTMLElement) => void;
}

/**
 * The suggested templates as one row of entries: as many as fit the available width, then a final
 * "+N more" entry counting the ones left out. Fitting is measured, not guessed: `visibleCount` is
 * `null` while measuring — every entry plus the widest overflow label is rendered, read back in a layout
 * effect (before paint, so the full row is never shown) and reduced to a count. The count is measured
 * again when the container's own width or the templates change. The container is block-level, so its width
 * comes from its wrapper and never from its entries — measuring them cannot change it.
 */
export function TemplateSuggestions({
  templates,
  onSelect,
  onOverflowClick,
}: TemplateSuggestionsProp) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const measuredWidthRef = useRef<number | null>(null);
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  // What the row looks like for measuring purposes: a new array with the same entries is not a change.
  const signature = templates
    .map(
      (template) =>
        `${template.id}\n${template.values.name}\n${template.emoji ?? ''}`
    )
    .join('\u0000');

  useLayoutEffect(() => {
    setVisibleCount(null);
  }, [signature]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const list = listRef.current;

    if (visibleCount !== null || !container || !list) {
      return;
    }

    // The container's own rendered width — after whatever width and max-width its wrapper gives it.
    const available = container.clientWidth;
    const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
    const widths = [
      ...list.querySelectorAll<HTMLElement>('[data-suggestion="template"]'),
    ].map((entry) => entry.getBoundingClientRect().width);
    // The overflow entry was measured with the largest count (the most digits), so it holds for any smaller one.
    const overflowWidth =
      list
        .querySelector<HTMLElement>('[data-suggestion="overflow"]')
        ?.getBoundingClientRect().width ?? 0;

    measuredWidthRef.current = available;
    setVisibleCount(
      computeVisibleTemplateCount(widths, () => overflowWidth, available, gap)
    );
  }, [visibleCount, signature]);

  useEffect(() => {
    const target = containerRef.current;

    if (!target || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (target.clientWidth !== measuredWidthRef.current) {
        setVisibleCount(null);
      }
    });

    observer.observe(target);

    return () => observer.disconnect();
  }, []);

  // The entries were measured in whatever font was showing: when the web fonts finish loading, their widths
  // change without the container changing, so measure again.
  useEffect(() => {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;

    if (!fonts || fonts.status === 'loaded') {
      return;
    }

    let cancelled = false;

    void fonts.ready.then(() => {
      if (!cancelled) {
        setVisibleCount(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const shown =
    visibleCount === null ? templates : templates.slice(0, visibleCount);
  const hidden = templates.length - shown.length;
  // While measuring, the overflow entry stands in at its widest (every template counted as hidden).
  const overflowCount = visibleCount === null ? templates.length : hidden;

  return (
    // The anchor spans the document and is pinned to its bottom; .template-suggestions takes the editor's
    // width and max-width (see the CSS), and the row measures itself against that.
    <div className="page__template-suggestions">
      <div className="template-suggestions" ref={containerRef}>
        <span className="template-suggestions__title">Start with template</span>
        <div className="template-suggestions__list" ref={listRef}>
          {shown.map((template) => (
            <Entry
              key={template.id}
              className="template-suggestions__item"
              data-suggestion="template"
              onClick={() => onSelect(template)}
              leading={<AppIcon icon="template" emoji={template.emoji} />}
            >
              <span>{template.values.name}</span>
            </Entry>
          ))}
          {overflowCount > 0 && (
            <Entry
              className="template-suggestions__item template-suggestions__item--overflow"
              data-suggestion="overflow"
              onClick={(event) => onOverflowClick(event.currentTarget)}
            >
              {`+${overflowCount} more`}
            </Entry>
          )}
        </div>
      </div>
    </div>
  );
}
