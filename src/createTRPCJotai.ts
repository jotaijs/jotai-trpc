import { createTRPCClient } from '@trpc/client';
import type { TRPCRequestOptions, CreateTRPCClientOptions } from '@trpc/client';
import type {
  AnyTRPCMutationProcedure,
  AnyTRPCProcedure,
  AnyTRPCQueryProcedure,
  AnyTRPCSubscriptionProcedure,
  AnyTRPCRouter,
  TRPCRouterRecord,
  TRPCProcedureOptions,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import type { inferObservableValue } from '@trpc/server/observable';

import { atom } from 'jotai/vanilla';
import type { Atom, Getter, WritableAtom } from 'jotai/vanilla';
import { atomWithObservable } from 'jotai/vanilla/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getProcedure = (obj: any, path: string[]) => {
  for (let i = 0; i < path.length; ++i) {
    obj = obj[path[i] as string];
  }
  return obj;
};

const isGetter = <T>(v: T | ((get: Getter) => T)): v is (get: Getter) => T =>
  typeof v === 'function';

type ValueOrGetter<T> = T | ((get: Getter) => T);
type AsyncValueOrGetter<T> =
  | T
  | Promise<T>
  | ((get: Getter) => T)
  | ((get: Getter) => Promise<T>);

export const DISABLED = Symbol();

type CustomOptions = { disabledOutput?: unknown };

const atomWithQuery = <TProcedure extends AnyTRPCQueryProcedure, TClient>(
  path: string[],
  getClient: (get: Getter) => TClient,
  getInput: AsyncValueOrGetter<
    inferProcedureInput<TProcedure> | typeof DISABLED
  >,
  getOptions?: ValueOrGetter<TRPCRequestOptions & CustomOptions>,
) => {
  type Output = inferProcedureOutput<TProcedure>;
  const refreshAtom = atom(0);
  const queryAtom = atom(
    async (get, { signal }) => {
      get(refreshAtom);
      const procedure = getProcedure(getClient(get), path);
      const options = isGetter(getOptions) ? getOptions(get) : getOptions;
      const input = await (isGetter(getInput) ? getInput(get) : getInput);
      if (input === DISABLED) {
        return options?.disabledOutput;
      }
      const output: Output = await procedure.query(input, {
        signal,
        ...options,
      });
      return output;
    },
    (_, set) => set(refreshAtom, (counter) => counter + 1),
  );
  return queryAtom;
};

const atomWithMutation = <TProcedure extends AnyTRPCMutationProcedure, TClient>(
  path: string[],
  getClient: (get: Getter) => TClient,
) => {
  type Args = [inferProcedureInput<TProcedure>, TRPCProcedureOptions];
  type Output = inferProcedureOutput<TProcedure>;
  const mutationAtom = atom(
    null as Output | null,
    async (get, set, args: Args) => {
      const procedure = getProcedure(getClient(get), path);
      const result: Output = await procedure.mutate(...args);
      set(mutationAtom, result);
      return result;
    },
  );
  return mutationAtom;
};

const atomWithSubscription = <
  TProcedure extends AnyTRPCSubscriptionProcedure,
  TClient,
>(
  path: string[],
  getClient: (get: Getter) => TClient,
  getInput: ValueOrGetter<inferProcedureInput<TProcedure>>,
  getOptions?: ValueOrGetter<TRPCRequestOptions>,
) => {
  type Output = inferProcedureOutput<TProcedure>;
  const subscriptionAtom = atomWithObservable((get) => {
    const procedure = getProcedure(getClient(get), path);
    const input = isGetter(getInput) ? getInput(get) : getInput;
    const options = isGetter(getOptions) ? getOptions(get) : getOptions;
    const observable = {
      subscribe: (arg: {
        next: (result: Output) => void;
        error: (err: unknown) => void;
      }) => {
        const callbacks = {
          onNext: arg.next.bind(arg),
          onError: arg.error.bind(arg),
        };
        const unsubscribable = procedure.subscribe(input, {
          ...options,
          ...callbacks,
        });
        return unsubscribable;
      },
    };
    return observable;
  });
  return subscriptionAtom;
};

type QueryResolver<TProcedure extends AnyTRPCProcedure, TClient> = {
  (
    getInput: AsyncValueOrGetter<inferProcedureInput<TProcedure>>,
    getOptions?: ValueOrGetter<TRPCProcedureOptions>,
    getClient?: (get: Getter) => TClient,
  ): WritableAtom<Promise<inferProcedureOutput<TProcedure>>, [], void>;
  (
    getInput: AsyncValueOrGetter<
      inferProcedureInput<TProcedure> | typeof DISABLED
    >,
    getOptions?: ValueOrGetter<
      TRPCProcedureOptions & { disabledOutput?: undefined }
    >,
    getClient?: (get: Getter) => TClient,
  ): WritableAtom<
    Promise<inferProcedureOutput<TProcedure> | undefined>,
    [],
    void
  >;
  <DisabledOutput>(
    getInput: AsyncValueOrGetter<
      inferProcedureInput<TProcedure> | typeof DISABLED
    >,
    getOptions: ValueOrGetter<
      TRPCProcedureOptions & { disabledOutput: DisabledOutput }
    >,
    getClient?: (get: Getter) => TClient,
  ): WritableAtom<
    Promise<inferProcedureOutput<TProcedure> | DisabledOutput>,
    [],
    void
  >;
};

type MutationResolver<TProcedure extends AnyTRPCProcedure, TClient> = (
  getClient?: (get: Getter) => TClient,
) => WritableAtom<
  inferProcedureOutput<TProcedure> | null,
  [[inferProcedureInput<TProcedure>, TRPCProcedureOptions]],
  Promise<inferProcedureOutput<TProcedure>>
>;

type SubscriptionResolver<TProcedure extends AnyTRPCProcedure, TClient> = (
  getInput: ValueOrGetter<inferProcedureInput<TProcedure>>,
  getOptions?: ValueOrGetter<TRPCProcedureOptions>,
  getClient?: (get: Getter) => TClient,
) => Atom<inferObservableValue<inferProcedureOutput<TProcedure>>>;

type DecorateProcedure<
  TProcedure extends AnyTRPCProcedure,
  TClient,
> = TProcedure extends AnyTRPCQueryProcedure
  ? {
      atomWithQuery: QueryResolver<TProcedure, TClient>;
    }
  : TProcedure extends AnyTRPCMutationProcedure
    ? {
        atomWithMutation: MutationResolver<TProcedure, TClient>;
      }
    : TProcedure extends AnyTRPCSubscriptionProcedure
      ? {
          atomWithSubscription: SubscriptionResolver<TProcedure, TClient>;
        }
      : never;

type DecoratedProcedureRecord<
  TProcedures extends TRPCRouterRecord,
  TClient,
> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyTRPCRouter
    ? DecoratedProcedureRecord<TProcedures[TKey]['_def']['record'], TClient>
    : TProcedures[TKey] extends AnyTRPCProcedure
      ? DecorateProcedure<TProcedures[TKey], TClient>
      : never;
};

export function createTRPCJotai<TRouter extends AnyTRPCRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const client = createTRPCClient<TRouter>(opts);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createProxy = (target: any, path: readonly string[] = []): any => {
    return new Proxy(
      () => {
        // empty
      },
      {
        get(_target, prop: string) {
          return createProxy(target[prop], [...path, prop]);
        },
        apply(_target, _thisArg, args) {
          const parentProp = path[path.length - 1];
          const parentPath = path.slice(0, -1);
          if (parentProp === 'atomWithQuery') {
            const [getInput, getOptions, getClient] = args;
            return atomWithQuery(
              parentPath,
              getClient || (() => client),
              getInput,
              getOptions,
            );
          }
          if (parentProp === 'atomWithMutation') {
            const [getClient] = args;
            return atomWithMutation(parentPath, getClient || (() => client));
          }
          if (parentProp === 'atomWithSubscription') {
            const [getInput, getOptions, getClient] = args;
            return atomWithSubscription(
              parentPath,
              getClient || (() => client),
              getInput,
              getOptions,
            );
          }
          throw new Error(`unexpected function call ${path.join('/')}`);
        },
      },
    );
  };

  return createProxy(client) as DecoratedProcedureRecord<
    TRouter['_def']['record'],
    typeof client
  >;
}
