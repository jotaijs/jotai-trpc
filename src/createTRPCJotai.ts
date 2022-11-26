import { createTRPCProxyClient, TRPCRequestOptions } from '@trpc/client';
import type { CreateTRPCClientOptions } from '@trpc/client';
import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnySubscriptionProcedure,
  AnyRouter,
  ProcedureArgs,
  ProcedureRouterRecord,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import type { inferObservableValue } from '@trpc/server/observable';

import { atom } from 'jotai/vanilla';
import type { Atom, Getter, WritableAtom } from 'jotai/vanilla';
import { atomWithObservable } from 'jotai/vanilla/utils';

const getProcedure = (obj: any, path: string[]) => {
  for (let i = 0; i < path.length; ++i) {
    obj = obj[path[i] as string];
  }
  return obj;
};

const isGetter = <T>(v: T | ((get: Getter) => T)): v is (get: Getter) => T =>
  typeof v === 'function';

type ValueOrGetter<T> = T | ((get: Getter) => T);

const atomWithQuery = <TProcedure extends AnyQueryProcedure, TClient>(
  path: string[],
  getClient: (get: Getter) => TClient,
  getInput: ValueOrGetter<inferProcedureInput<TProcedure>>,
  getOptions?: ValueOrGetter<TRPCRequestOptions>,
) => {
  type Output = inferProcedureOutput<TProcedure>;
  const queryAtom = atom(async (get, { signal }) => {
    const procedure = getProcedure(getClient(get), path);
    const input = isGetter(getInput) ? getInput(get) : getInput;
    const options = isGetter(getOptions) ? getOptions(get) : getOptions;
    const output: Output = await procedure.query(input, { signal, ...options });
    return output;
  });
  return queryAtom;
};

const atomWithMutation = <TProcedure extends AnyMutationProcedure, TClient>(
  path: string[],
  getClient: (get: Getter) => TClient,
) => {
  type Args = ProcedureArgs<TProcedure['_def']>;
  type Output = inferProcedureOutput<TProcedure>;
  const mutationAtom = atom(
    null as Output | null,
    async (get, set, args: Args) => {
      const procedure = getProcedure(getClient(get), path);
      const result: Output = await procedure.mutation(...args);
      set(mutationAtom, result);
      return result;
    },
  );
  return mutationAtom;
};

const atomWithSubscription = <
  TProcedure extends AnySubscriptionProcedure,
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

type QueryResolver<TProcedure extends AnyProcedure, TClient> = (
  getInput: ValueOrGetter<ProcedureArgs<TProcedure['_def']>[0]>,
  getOptions?: ValueOrGetter<ProcedureArgs<TProcedure['_def']>[1]>,
  getClient?: (get: Getter) => TClient,
) => Atom<Promise<inferProcedureOutput<TProcedure>>>;

type MutationResolver<TProcedure extends AnyProcedure, TClient> = (
  getClient?: (get: Getter) => TClient,
) => WritableAtom<
  inferProcedureOutput<TProcedure> | null,
  [ProcedureArgs<TProcedure['_def']>],
  Promise<inferProcedureOutput<TProcedure>>
>;

type SubscriptionResolver<TProcedure extends AnyProcedure, TClient> = (
  getInput: ValueOrGetter<ProcedureArgs<TProcedure['_def']>[0]>,
  getOptions?: ValueOrGetter<ProcedureArgs<TProcedure['_def']>[1]>,
  getClient?: (get: Getter) => TClient,
) => Atom<inferObservableValue<inferProcedureOutput<TProcedure>>>;

type DecorateProcedure<
  TProcedure extends AnyProcedure,
  TClient,
> = TProcedure extends AnyQueryProcedure
  ? {
      atomWithQuery: QueryResolver<TProcedure, TClient>;
    }
  : TProcedure extends AnyMutationProcedure
  ? {
      atomWithMutation: MutationResolver<TProcedure, TClient>;
    }
  : TProcedure extends AnySubscriptionProcedure
  ? {
      atomWithSubscription: SubscriptionResolver<TProcedure, TClient>;
    }
  : never;

type DecoratedProcedureRecord<
  TProcedures extends ProcedureRouterRecord,
  TClient,
> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? DecoratedProcedureRecord<TProcedures[TKey]['_def']['record'], TClient>
    : TProcedures[TKey] extends AnyProcedure
    ? DecorateProcedure<TProcedures[TKey], TClient>
    : never;
};

export function createTRPCJotai<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const client = createTRPCProxyClient<TRouter>(opts);

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
