import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CountBadge, formatCount } from '@components/count-badge/CountBadge';
import { AppIcon, type SystemIcon } from '@shared/icon';
import './TaskTabIndicator.css';

const SWAP_DURATION = 280;
const displayKey = (count: number) => (count > 0 ? formatCount(count) : 'icon');
interface Motion {
  id: number;
  from: number;
  target: string;
  width: number;
  kind: 'number' | 'to-count' | 'to-icon';
}

/** Decorative content: the parent Tasks tab always exposes the latest count in its accessible name. */
export function TaskTabIndicator({
  count,
  icon,
}: {
  count: number;
  icon: SystemIcon;
}) {
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [motion, setMotion] = useState<Motion | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const currentRef = useRef<HTMLSpanElement>(null);
  const previousCount = useRef(count);
  const previousWidth = useRef(0);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const widthAnimations = useRef<Animation[]>([]);
  const cancelWidths = () => {
    widthAnimations.current.forEach((animation) => animation.cancel());
    widthAnimations.current = [];
  };

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(preference.matches);
    change();
    preference.addEventListener('change', change);
    return () => preference.removeEventListener('change', change);
  }, []);

  useLayoutEffect(() => {
    const from = previousCount.current;
    previousCount.current = count;
    const root = rootRef.current;
    const current = currentRef.current;
    if (!root || !current) return;
    if (reducedMotion) {
      clearTimeout(timer.current);
      cancelWidths();
      setMotion(null);
      previousWidth.current = current.getBoundingClientRect().width;
      return;
    }
    if (displayKey(from) === displayKey(count)) {
      if (!previousWidth.current)
        previousWidth.current = current.getBoundingClientRect().width;
      return;
    }
    // Interrupt at the width currently on screen, then measure the latest natural content width.
    const fromWidth =
      widthAnimations.current[0]?.playState === 'running'
        ? root.getBoundingClientRect().width
        : previousWidth.current;
    cancelWidths();
    const width = current.getBoundingClientRect().width;
    previousWidth.current = width;
    const isNumberChange = from > 0 && count > 0;
    if (
      fromWidth > 0 &&
      width > 0 &&
      fromWidth !== width &&
      typeof root.animate === 'function'
    ) {
      const frames = [{ width: `${fromWidth}px` }, { width: `${width}px` }];
      const timing = {
        duration: SWAP_DURATION,
        easing: 'cubic-bezier(.22, 1, .36, 1)',
      };
      widthAnimations.current.push(root.animate(frames, timing));
      const badge = current.querySelector<HTMLElement>('.count-badge');
      if (badge) widthAnimations.current.push(badge.animate(frames, timing));
    }
    const next: Motion = {
      id: ++sequence.current,
      from,
      target: displayKey(count),
      width: fromWidth,
      kind: isNumberChange ? 'number' : count > 0 ? 'to-count' : 'to-icon',
    };
    clearTimeout(timer.current);
    setMotion(next);
    timer.current = setTimeout(
      () => setMotion((active) => (active?.id === next.id ? null : active)),
      SWAP_DURATION
    );
  }, [count, reducedMotion]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      cancelWidths();
    },
    []
  );
  const active =
    !reducedMotion && motion?.target === displayKey(count) ? motion : null;

  return (
    <span
      ref={rootRef}
      className="task-tab-indicator"
      aria-hidden="true"
      data-motion={active?.kind}
    >
      <span
        ref={currentRef}
        className="task-tab-indicator__current"
        data-symbol={count > 0 ? 'count' : 'icon'}
      >
        {count > 0 ? (
          <CountBadge key={active?.id ?? 'rest'} count={count} />
        ) : (
          <AppIcon icon={icon} className="task-tab-indicator__icon" />
        )}
      </span>
      {active && (
        <span key={active.id} className="task-tab-indicator__outgoing">
          <span
            className="task-tab-indicator__old-symbol"
            style={active.width > 0 ? { width: active.width } : undefined}
          >
            {active.from > 0 ? (
              <CountBadge count={active.from} />
            ) : (
              <AppIcon icon={icon} />
            )}
          </span>
        </span>
      )}
    </span>
  );
}
