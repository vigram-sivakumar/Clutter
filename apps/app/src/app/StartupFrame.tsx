import type { ReactNode } from 'react';
import { TauriDragStrip } from '@components/tauri-drag-strip/TauriDragStrip';
import './StartupFrame.css';

interface StartupFrameProps {
  tone?: 'status' | 'error';
  children: ReactNode;
}

/**
 * What AppShell shows until there is a workspace: a themed surface with one
 * quiet line of text, and the same drag strip the workspace has so the window
 * can be moved from the first frame.
 */
export function StartupFrame({ tone = 'status', children }: StartupFrameProps) {
  return (
    <div
      className="startup-frame"
      data-tone={tone}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <TauriDragStrip />
      <p className="startup-frame__message">{children}</p>
    </div>
  );
}
