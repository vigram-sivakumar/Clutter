import { useEffect, useState } from 'react';

import { EffectivePageState } from '../../core/application/page/EffectivePageState';

export function useEffectivePageState(
  effectivePageState: EffectivePageState
): EffectivePageState {
  const [, setVersion] = useState(0);

  useEffect(() => {
    return effectivePageState.subscribe(() => {
      setVersion((version) => version + 1);
    });
  }, [effectivePageState]);

  return effectivePageState;
}
