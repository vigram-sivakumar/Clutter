import { useEffect, useState } from 'react';

import { ReferencesDisplayStore } from '../../core/application/references/ReferencesDisplayStore';

export function useReferencesDisplayStore(store: ReferencesDisplayStore): ReferencesDisplayStore {
  const [, setVersion] = useState(0);

  useEffect(() => {
    return store.subscribe(() => {
      setVersion((version) => version + 1);
    });
  }, [store]);

  return store;
}
