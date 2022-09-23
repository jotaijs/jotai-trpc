import { createTRPCClient, TRPCRequestOptions } from '@trpc/client';
import type { CreateTRPCClientOptions } from '@trpc/client';
import type { AnyRouter, inferHandlerInput } from '@trpc/server';

import { atom } from 'jotai';
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

  return {
    client,
    atomWithQuery,
    atomWithMutation,
  };
}
