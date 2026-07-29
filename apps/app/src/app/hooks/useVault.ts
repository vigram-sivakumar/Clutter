import { useEffect, useState } from 'react';

import { Vault } from '../../core/vault/models/Vault';

export function useVault(vault: Vault): Vault {
  const [, setVersion] = useState(0);

  useEffect(() => {
    return vault.subscribe((_event) => {
      setVersion((version) => version + 1);
    });
  }, [vault]);

  return vault;
}
