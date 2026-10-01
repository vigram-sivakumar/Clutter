import { useEffect, useState } from 'react';

import { TagExpansionStore } from '../../core/application/tags/TagExpansionStore';

export function useTagExpansionStore(store: TagExpansionStore): TagExpansionStore {
  const [, setVersion] = useState(0);

  useEffect(() => {
    return store.subscribe(() => {
      setVersion((version) => version + 1);
    });
  }, [store]);

  return store;
}
