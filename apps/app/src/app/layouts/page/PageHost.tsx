import type { Application } from '@core/application/Application';

import { MockPage } from './MockPage';
import { useWorkspace } from '@app/hooks/useWorkspace';

interface PageHostProps {
  application: Application;
}

/**
 * Hosts the primary page content for the current workspace.
 *
 * Eventually this component will:
 * - Observe the active workspace page.
 * - Resolve the corresponding DocumentSession.
 * - Render the appropriate page feature.
 *
 * For now it intentionally delegates to MockPage while the
 * workspace-driven page flow is being implemented.
 */
export function PageHost({ application }: PageHostProps) {
  const workspace = useWorkspace(application.workspace);

  const activePageId = workspace.activePageId;

  const session = activePageId
    ? application.pageService.getSession(activePageId)
    : undefined;

  console.log('[PageHost]', {
    activePageId,
    hasSession: session !== undefined,
  });

  // Temporary until the real page renderer is implemented.
  // Keep the values alive while we validate the application flow.
  void session;

  return <MockPage />;
}
