import { createTRPCClient, TRPCRequestOptions } from '@trpc/client';
import type { CreateTRPCClientOptions, TRPCClientError } from '@trpc/client';
import type {
  AnyRouter,
  inferHandlerInput,
  inferProcedureInput,
  inferSubscriptionOutput,
} from '@trpc/server';
import type { TRPCResult } from '@trpc/server/rpc';

import { atom } from 'jotai';
import { atomWithObservable } from 'jotai/utils';
import type { Getter } from 'jotai';

const isGetter = <T>(v: T | ((get: Getter) => T)): v is (get: Getter) => T =>
  typeof v === 'function';

type ValueOrGetter<T> = T | ((get: Getter) => T);

export function createAtomCreators<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const client = createTRPCClient<TRouter>(opts);

  type TQueries = TRouter['_def']['queries'];
  const atomWithQuery = <TPath extends keyof TQueries & string>(
    path: TPath,
    getInput: ValueOrGetter<inferHandlerInput<TQueries[TPath]>>,
    getOptions?: ValueOrGetter<TRPCRequestOptions>,
    getClient?: (get: Getter) => typeof client,
  ) => {
    const queryAtom = atom(async (get) => {
      const input = isGetter(getInput) ? getInput(get) : getInput;
      const options = isGetter(getOptions) ? getOptions(get) : getOptions;
      const currentClient = getClient ? getClient(get) : client;
      const result = await currentClient.query(
        path,
        ...input,
        options as TRPCRequestOptions,
      );
      return result;
    });
    return queryAtom;
  };

  type TMutations = TRouter['_def']['mutations'];
  const atomWithMutation = <TPath extends keyof TMutations & string>(
    path: TPath,
    getClient?: (get: Getter) => typeof client,
  ) => {
    type Result = Awaited<ReturnType<TMutations[TPath]['call']>>;
    const mutationAtom = atom(
      null as Result | null,
      async (
        get,
        set,
        args: [...inferHandlerInput<TMutations[TPath]>, TRPCRequestOptions?],
      ) => {
        const currentClient = getClient ? getClient(get) : client;
        const result = await currentClient.mutation(
          path,
          ...(args as [
            ...inferHandlerInput<TMutations[TPath]>,
            TRPCRequestOptions,
          ]),
        );
        set(mutationAtom, result as any);
      },
    );
    return mutationAtom;
  };

  type TSubscriptions = TRouter['_def']['subscriptions'];
  const atomWithSubscription = <TPath extends keyof TSubscriptions & string>(
    path: TPath,
    getInput: ValueOrGetter<inferProcedureInput<TSubscriptions[TPath]>>,
    getOptions?: ValueOrGetter<TRPCRequestOptions>,
    getClient?: (get: Getter) => typeof client,
  ) => {
    type Result = TRPCResult<inferSubscriptionOutput<TRouter, TPath>>;
    type Err = TRPCClientError<TRouter>;
    const subscriptionAtom = atomWithObservable((get) => {
      const input = isGetter(getInput) ? getInput(get) : getInput;
      const options = isGetter(getOptions) ? getOptions(get) : getOptions;
      const currentClient = getClient ? getClient(get) : client;
      const observable = {
        subscribe: (
          arg:
            | { next: (result: Result) => void; error: (err: Err) => void }
            | ((result: Result) => void),
          arg2?: (err: Err) => void,
        ) => {
          const callbacks =
            typeof arg === 'function'
              ? {
                  onNext: arg,
                  onError: arg2 || (() => undefined),
                }
              : {
                  onNext: arg.next.bind(arg),
                  onError: arg.error.bind(arg),
                };
          const unsubscribe = currentClient.subscription(path, input, {
            ...options,
            ...callbacks,
          });
          return { unsubscribe };
        },
      };
      return observable;
    });
    return subscriptionAtom;
  };

  return {
    client,
    atomWithQuery,
    atomWithMutation,
    atomWithSubscription,
  };
}
