import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
} from 'react';

import { CalendarTodayIcon, ICON_MEDIUM, Icons } from '../design-system/icons';

export type TabId = 'calendar' | 'notes' | 'tasks' | 'tags';

type TabDef =
  | { id: 'calendar'; label: string }
  | { id: Exclude<TabId, 'calendar'>; label: string; Icon: PhosphorIcon };

const TABS: TabDef[] = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'notes', label: 'Notes', Icon: Icons.NoteBlank },
  { id: 'tasks', label: 'Tasks', Icon: Icons.CheckCircle },
  { id: 'tags', label: 'Tags', Icon: Icons.Tag },
];

type ThumbMetrics = { x: number; y: number; w: number; h: number };

const ZERO_THUMB: ThumbMetrics = { x: 0, y: 0, w: 0, h: 0 };

export type TabsProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & {
  direction?: 'horizontal' | 'vertical';
  /** Controlled selected tab. */
  value?: TabId;
  /** Uncontrolled default. */
  defaultValue?: TabId;
  onValueChange?: (id: TabId) => void;
};

export function Tabs({
  direction = 'horizontal',
  value: valueProp,
  defaultValue = 'calendar',
  onValueChange,
  className,
  ...divProps
}: TabsProps) {
  const baseId = useId();
  const [internal, setInternal] = useState<TabId>(defaultValue);
  const value = valueProp ?? internal;

  const trackRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [thumb, setThumb] = useState<ThumbMetrics>(ZERO_THUMB);

  const setValue = useCallback(
    (id: TabId) => {
      if (valueProp === undefined) {
        setInternal(id);
      }
      onValueChange?.(id);
    },
    [onValueChange, valueProp]
  );

  const updateThumb = useCallback(() => {
    const track = trackRef.current;
    const idx = TABS.findIndex((t) => t.id === value);
    const tab = idx >= 0 ? tabRefs.current[idx] : null;
    if (!track || !tab) {
      setThumb(ZERO_THUMB);
      return;
    }
    setThumb({
      x: tab.offsetLeft,
      y: tab.offsetTop,
      w: tab.offsetWidth,
      h: tab.offsetHeight,
    });
  }, [value]);

  useLayoutEffect(() => {
    updateThumb();
  }, [updateThumb, direction]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(() => {
      updateThumb();
    });
    ro.observe(track);
    window.addEventListener('resize', updateThumb);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateThumb);
    };
  }, [updateThumb]);

  const cls = [
    'clutter-tabs',
    direction === 'horizontal' ? 'clutter-tabs--horizontal' : 'clutter-tabs--vertical',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const tablistId = `${baseId}-tablist`;

  return (
    <div className={cls} {...divProps}>
      <div
        id={tablistId}
        ref={trackRef}
        className="clutter-tabs__track"
        role="tablist"
        aria-orientation={direction === 'vertical' ? 'vertical' : 'horizontal'}
      >
        <div
          className="clutter-tabs__thumb"
          aria-hidden
          style={{
            transform: `translate3d(${thumb.x}px, ${thumb.y}px, 0)`,
            width: thumb.w,
            height: thumb.h,
          }}
        />
        {TABS.map((tab, index) => {
          const selected = value === tab.id;
          const tabId = `${baseId}-tab-${tab.id}`;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              id={tabId}
              type="button"
              role="tab"
              className="clutter-tabs__tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              aria-label={tab.label}
              onClick={() => setValue(tab.id)}
            >
              <span className="clutter-tabs__icon" aria-hidden>
                {tab.id === 'calendar' ? (
                  <CalendarTodayIcon size={ICON_MEDIUM} />
                ) : (
                  <tab.Icon size={ICON_MEDIUM} weight="regular" />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
