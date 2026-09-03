import { useState } from 'react';

import { Button } from '@components/button/Button';

import './ImageResourceBody.css';

export type ImageDisplayMode = 'fit' | 'original';

export interface ImageResourceBodyProps {
  readonly imageUrl: string;
  readonly alt: string;
}

/**
 * The Image Resource Page's viewer body. Owns its own display-mode state
 * (Original/Fit) — page-view state, not a resource mutation or a
 * persisted preference (per the task's explicit "no new persistence"
 * scope); the caller resets it per-resource via a `key={resource.id}` on
 * this component, the same convention MarkdownEditor/PageHost already use
 * elsewhere for per-entity remount.
 *
 * Fit: the whole image always visible, scaled down only, never cropped or
 * distorted (`object-fit: contain` inside a bounded frame).
 * Original: native size, never upscaled; only capped by `max-width` when
 * wider than the available area — never an unconditional `width: 100%`.
 */
export function ImageResourceBody({ imageUrl, alt }: ImageResourceBodyProps) {
  const [mode, setMode] = useState<ImageDisplayMode>('fit');
  const [isBroken, setIsBroken] = useState(false);

  return (
    <div className="image-resource-body">
      <div className="image-resource-body__toolbar">
        <Button
          size="small"
          variant={mode === 'fit' ? 'filled' : 'ghost'}
          aria-pressed={mode === 'fit'}
          onClick={() => setMode('fit')}
        >
          Fit
        </Button>
        <Button
          size="small"
          variant={mode === 'original' ? 'filled' : 'ghost'}
          aria-pressed={mode === 'original'}
          onClick={() => setMode('original')}
        >
          Original
        </Button>
      </div>
      <div className="image-resource-body__frame">
        {isBroken ? (
          <div className="image-resource-body__broken">This image can't be displayed.</div>
        ) : (
          <img
            src={imageUrl}
            alt={alt}
            className={`image-resource-body__img image-resource-body__img--${mode}`}
            onError={() => setIsBroken(true)}
          />
        )}
      </div>
    </div>
  );
}
