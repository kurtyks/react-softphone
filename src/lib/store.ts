/**
 * Minimal reactive store — a dependency-free reimplementation of the tiny subset
 * of the `svelte/store` runtime API (`writable`, `derived`, `get`) that the state
 * layer and its unit tests rely on. This is NOT the Svelte framework; it is a ~2 KB
 * observable-value utility. React components subscribe via the `useStore` hook
 * (see `useStore.ts`); the SIP orchestrator drives these stores imperatively.
 *
 * Semantics match Svelte's: `subscribe` fires immediately with the current value,
 * and `set`/`update` notify only when the value actually changed (`safe_not_equal`).
 */

export type Subscriber<T> = (value: T) => void;
export type Unsubscriber = () => void;
export type Updater<T> = (value: T) => T;

export interface Readable<T> {
  subscribe(run: Subscriber<T>): Unsubscriber;
}

export interface Writable<T> extends Readable<T> {
  set(value: T): void;
  update(updater: Updater<T>): void;
}

/** Svelte's dirty-check: always notify for objects/functions, dedupe primitives. */
function safeNotEqual(a: unknown, b: unknown): boolean {
  // eslint-disable-next-line no-self-compare
  return a != a
    ? b == b
    : a !== b || (a !== null && typeof a === 'object') || typeof a === 'function';
}

export function writable<T>(initial: T): Writable<T> {
  let value = initial;
  const subscribers = new Set<Subscriber<T>>();

  function set(next: T): void {
    if (!safeNotEqual(value, next)) return;
    value = next;
    for (const run of subscribers) run(value);
  }

  function update(updater: Updater<T>): void {
    set(updater(value));
  }

  function subscribe(run: Subscriber<T>): Unsubscriber {
    subscribers.add(run);
    run(value);
    return () => subscribers.delete(run);
  }

  return { set, update, subscribe };
}

/** Read a store's current value synchronously (one-shot subscribe). */
export function get<T>(store: Readable<T>): T {
  let value!: T;
  const unsub = store.subscribe((v) => {
    value = v;
  });
  unsub();
  return value;
}

// Single store, a non-empty tuple of stores, or an array of stores. The explicit
// tuple form biases inference toward a tuple so `StoresValues` keeps per-store types.
type Stores =
  | Readable<unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | [Readable<unknown>, ...Array<Readable<any>>]
  | Array<Readable<unknown>>;

type StoresValues<T> = T extends Readable<infer U>
  ? U
  : { [K in keyof T]: T[K] extends Readable<infer U> ? U : never };

/**
 * Synchronous derived store. Supports the single-store and array-of-stores forms
 * with a pure mapping function (the only forms used in this codebase).
 */
export function derived<S extends Stores, T>(
  stores: S,
  fn: (values: StoresValues<S>) => T
): Readable<T> {
  const single = !Array.isArray(stores);
  const storesArr = (single ? [stores] : stores) as Readable<unknown>[];

  return {
    subscribe(run: Subscriber<T>): Unsubscriber {
      const values: unknown[] = [];
      let ready = false;

      const emit = () => {
        if (!ready) return;
        run(fn((single ? values[0] : values) as StoresValues<S>));
      };

      const unsubs = storesArr.map((store, i) =>
        store.subscribe((v) => {
          values[i] = v;
          emit();
        })
      );

      ready = true;
      emit();

      return () => {
        for (const u of unsubs) u();
      };
    }
  };
}
