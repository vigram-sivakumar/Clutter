import type { ReactNode } from 'react';
import { TauriDragStrip } from '@components/tauri-drag-strip/TauriDragStrip';
import './StartupFrame.css';

interface StartupFrameProps {
  tone?: 'status' | 'error';
  /**
   * An image filling the frame (cover, centred) — for the first-run Welcome screen, whose dialog (and
   * its overlay scrim) sits over it. Absent, the frame is the plain themed surface; if the image can't
   * load, that surface is what shows.
   */
  backgroundImage?: string;
  children: ReactNode;
}

/**
 * What AppShell shows until there is a workspace: a themed surface with one
 * quiet line of text, and the same drag strip the workspace has so the window
 * can be moved from the first frame.
 */
export function StartupFrame({ tone = 'status', backgroundImage, children }: StartupFrameProps) {
  return (
    <div
      className="startup-frame"
      data-tone={tone}
      data-backdrop={backgroundImage ? 'image' : undefined}
      style={backgroundImage ? { backgroundImage: `url(${JSON.stringify(backgroundImage)})` } : undefined}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <TauriDragStrip />
      <p className="startup-frame__message">{children}</p>
    </div>
  );
}
