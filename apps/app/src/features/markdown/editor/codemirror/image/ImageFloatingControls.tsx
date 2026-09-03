import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

import './ImageFloatingControls.css';

export interface ImageFloatingControlsProps
  extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * The floating-control container's own visual treatment (background,
 * radius, shadow, padding) — a thin React wrapper around
 * `ImageFloatingControls.css`'s `.cm-image-controls` class, the exact same
 * class `ImageWidget.ts`'s raw CM6 DOM already uses for the inline image's
 * own controls. This is the only "shared component" half of the shared
 * primitive that can actually be a React component — the CSS class itself
 * (not this wrapper) is what the non-React inline widget reuses; see that
 * CSS file's own doc comment. Positioning (where the container sits
 * relative to its image) is deliberately left to the caller via `className`
 * — this component owns appearance only, never layout/placement, which
 * differs between the always-visible overlay context and the CM6
 * hover-reveal context.
 */
export const ImageFloatingControls = forwardRef<
  HTMLDivElement,
  ImageFloatingControlsProps
>(function ImageFloatingControls({ className, children, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={['cm-image-controls', className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  );
});

export interface ImageFloatingControlButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

/**
 * One floating-control button's own visual treatment (dimensions, radius,
 * color, hover/active state, icon sizing) — the React counterpart to
 * `ImageWidget.ts`'s own hand-built `<button class="cm-image-control">`
 * (`makeButton`), reusing the identical `.cm-image-control`/
 * `.cm-image-control--active` classes rather than a second style
 * implementation. Deliberately a plain `<button>`, not `@components/button/
 * Button` — `Button`'s own variant/size classes carry their own opinionated
 * chrome that would fight this shared chrome for the same CSS properties
 * (width/padding/radius/background) with no reliable winner, which is
 * exactly the "pixel-identical to the inline control" guarantee this
 * primitive exists to give. `ImageOptionsMenu.tsx`'s own doc comment
 * documents the same `Button`-can't-be-reshaped conclusion, reached
 * independently, for its own (CM6-anchored, not React-rendered) trigger
 * button.
 */
export const ImageFloatingControlButton = forwardRef<
  HTMLButtonElement,
  ImageFloatingControlButtonProps
>(function ImageFloatingControlButton(
  { className, active = false, type = 'button', children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        'cm-image-control',
        active && 'cm-image-control--active',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </button>
  );
});
