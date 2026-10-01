import { useEffect, useState } from 'react';

import { DailyNotesSidebarState } from '../../core/application/daily-notes/DailyNotesSidebarState';

export function useDailyNotesSidebarState(state: DailyNotesSidebarState): DailyNotesSidebarState {
  const [, setVersion] = useState(0);

  useEffect(() => {
    return state.subscribe(() => {
      setVersion((version) => version + 1);
    });
  }, [state]);

  return state;
}
