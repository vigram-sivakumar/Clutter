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
  /**
   * A decorative layer filling the frame, painted under the drag strip and the message (e.g. the animated
   * gradient on the Welcome screen). It must not take clicks.
   */
  backdrop?: ReactNode;
  children: ReactNode;
}

/**
 * What AppShell shows until there is a workspace: a themed surface with one
 * quiet line of text, and the same drag strip the workspace has so the window
 * can be moved from the first frame.
 */
export function StartupFrame({ tone = 'status', backgroundImage, backdrop, children }: StartupFrameProps) {
  return (
    <div
      className="startup-frame"
      data-tone={tone}
      data-backdrop={backgroundImage ? 'image' : undefined}
      style={backgroundImage ? { backgroundImage: `url(${JSON.stringify(backgroundImage)})` } : undefined}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {backdrop}
      <TauriDragStrip />
      <p className="startup-frame__message">{children}</p>
    </div>
  );
}
