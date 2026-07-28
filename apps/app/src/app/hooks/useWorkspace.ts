import { useEffect, useState } from 'react';

import { Workspace } from '@core/workspace/Workspace';

export function useWorkspace(workspace: Workspace): Workspace {
  const [, setVersion] = useState(0);

  useEffect(() => {
    return workspace.subscribe(() => {
      setVersion((version) => version + 1);
    });
  }, [workspace]);

  return workspace;
}
