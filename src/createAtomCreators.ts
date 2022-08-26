import { createTRPCClient, TRPCRequestOptions } from '@trpc/client';
import type { CreateTRPCClientOptions } from '@trpc/client';
import type { AnyRouter, inferHandlerInput } from '@trpc/server';

import { atom } from 'jotai';
import type { Getter } from 'jotai';

const isGetter = <T>(v: T | ((get: Getter) => T)): v is (get: Getter) => T =>
  typeof v === 'function';

type ArgsOrGetter<T> = T | ((get: Getter) => T);

export function createAtomCreators<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const client = createTRPCClient<TRouter>(opts);

  type TQueries = TRouter['_def']['queries'];
  const atomWithQuery = <TPath extends keyof TQueries & string>(
    getArgs: ArgsOrGetter<
      [
        path: TPath,
        ...args: [...inferHandlerInput<TQueries[TPath]>, TRPCRequestOptions?],
      ]
    >,
    getClient?: (get: Getter) => typeof client,
  ) => {
    const queryAtom = atom(async (get) => {
      const args = isGetter(getArgs) ? getArgs(get) : getArgs;
      const currentClient = getClient ? getClient(get) : client;
      const result = await currentClient.query(...args);
      return result;
    });
    return queryAtom;
  };

  return {
    client,
    atomWithQuery,
    // TODO atomWithMutation,
  };
}
