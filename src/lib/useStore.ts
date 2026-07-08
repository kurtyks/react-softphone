import { useSyncExternalStore } from 'react';
import type { Readable } from './store';

/**
 * Subscribe a React component to a `store.ts` Readable. Re-renders on every emit;
 * the store's `safe_not_equal` dedupe keeps that from firing on no-op writes.
 * Mirrors Svelte's `$store` auto-subscription in a React idiom.
 */
export function useStore<T>(store: Readable<T>): T {
  return useSyncExternalStore(
    (onChange) => store.subscribe(onChange),
    () => readCurrent(store),
    () => readCurrent(store)
  );
}

// One-shot read of the store's current value (getSnapshot for useSyncExternalStore).
function readCurrent<T>(store: Readable<T>): T {
  let value!: T;
  const unsub = store.subscribe((v) => {
    value = v;
  });
  unsub();
  return value;
}
