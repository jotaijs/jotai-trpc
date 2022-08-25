import { createTRPCClient } from '@trpc/client';
import type { CreateTRPCClientOptions } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';

import { atom } from 'jotai';
import type { Getter } from 'jotai';

const isGetter = <T>(v: T | ((get: Getter) => T)): v is (get: Getter) => T =>
  typeof v === 'function';

export function createAtomCreators<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const client = createTRPCClient<TRouter>(opts);

  type Args = Parameters<typeof client.query>;

  const atomWithQuery = (
    getArgs: Args | ((get: Getter) => Args),
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
    atomWithQuery,
    // TODO atomWithMutation,
  };
}
