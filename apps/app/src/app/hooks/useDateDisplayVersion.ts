import { useSyncExternalStore } from 'react';

import { readDateFormatChoice, subscribeDateFormatChoice } from '@shared/helpers/time/dateFormatPreference';
import { getSystemLocale, subscribeSystemLocale } from '@shared/helpers/time/dateLocale';

function subscribe(listener: () => void): () => void {
  const unsubscribeFormat = subscribeDateFormatChoice(listener);
  const unsubscribeLocale = subscribeSystemLocale(listener);

  return () => {
    unsubscribeFormat();
    unsubscribeLocale();
  };
}

const snapshot = (): string => `${readDateFormatChoice()}|${getSystemLocale()}`;

/**
 * Re-renders the component it is called in whenever the Date format preference or the system language
 * changes. The date formatters read both at the moment they run, so a view that already drew its dates only
 * needs something to render it again; one call near the root of the app is enough, as for the vault and
 * workspace subscriptions beside it.
 */
export function useDateDisplayVersion(): string {
  return useSyncExternalStore(subscribe, snapshot);
}
