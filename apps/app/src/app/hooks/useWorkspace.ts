import { useEffect, useState } from 'react';

import { Workspace } from '@core/workspace/Workspace';

/**
 * React adapter for the Workspace domain model.
 *
 * Subscribes to workspace changes and triggers React re-renders while
 * keeping the Workspace itself completely framework-agnostic.
 */
export function useWorkspace(workspace: Workspace): Workspace {
  const [, setVersion] = useState(0);

  useEffect(() => {
    return workspace.subscribe(() => {
      setVersion((version) => version + 1);
    });
  }, [workspace]);

  return workspace;
}
