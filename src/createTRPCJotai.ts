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
  inferObservableValue,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';

import { atom } from 'jotai';
import { atomWithObservable } from 'jotai/utils';
import type { Atom, Getter, WritableAtom } from 'jotai';

const isGetter = <T>(v: T | ((get: Getter) => T)): v is (get: Getter) => T =>
  typeof v === 'function';

type ValueOrGetter<T> = T | ((get: Getter) => T);

const atomWithQuery = <TProcedure extends AnyQueryProcedure>(
  getProcedure: (get: Getter) => TProcedure,
  getInput: ValueOrGetter<inferProcedureInput<TProcedure>>,
  getOptions?: ValueOrGetter<TRPCRequestOptions>,
) => {
  type Output = inferProcedureOutput<TProcedure>;
  const queryAtom = atom(async (get) => {
    const procedure = getProcedure(get);
    const input = isGetter(getInput) ? getInput(get) : getInput;
    const options = isGetter(getOptions) ? getOptions(get) : getOptions;
    const output: Output = await (procedure as any).query(input, options);
    return output;
  });
  return queryAtom;
};

const atomWithMutation = <TProcedure extends AnyMutationProcedure>(
  getProcedure: (get: Getter) => TProcedure,
) => {
  type Args = ProcedureArgs<TProcedure['_def']>;
  type Output = inferProcedureOutput<TProcedure>;
  const mutationAtom = atom(
    null as Output | null,
    async (get, set, args: Args) => {
      const procedure = getProcedure(get);
      const result = await (procedure as any).mutation(...args);
      set(mutationAtom, result as any);
    },
  );
  return mutationAtom;
};

const atomWithSubscription = <TProcedure extends AnySubscriptionProcedure>(
  getProcedure: (get: Getter) => TProcedure,
  getInput: ValueOrGetter<inferProcedureInput<TProcedure>>,
  getOptions?: ValueOrGetter<TRPCRequestOptions>,
) => {
  type Output = inferProcedureOutput<TProcedure>;
  const subscriptionAtom = atomWithObservable((get) => {
    const procedure = getProcedure(get);
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
        const unsubscribable = (procedure as any).subscribe(input, {
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

type QueryResolver<TProcedure extends AnyProcedure> = (
  getInput: ValueOrGetter<ProcedureArgs<TProcedure['_def']>[0]>,
  getOptions: ValueOrGetter<ProcedureArgs<TProcedure['_def']>[1]>,
  getProcedure?: (get: Getter) => TProcedure,
) => Atom<Promise<inferProcedureOutput<TProcedure>>>;

type MutationResolver<TProcedure extends AnyProcedure> = (
  getProcedure?: (get: Getter) => TProcedure,
) => WritableAtom<
  inferProcedureOutput<TProcedure> | null,
  ProcedureArgs<TProcedure['_def']>
>;

type SubscriptionResolver<TProcedure extends AnyProcedure> = (
  getInput: ValueOrGetter<ProcedureArgs<TProcedure['_def']>[0]>,
  getOptions: ValueOrGetter<ProcedureArgs<TProcedure['_def']>[1]>,
  getProcedure?: (get: Getter) => TProcedure,
) => Atom<inferObservableValue<inferProcedureOutput<TProcedure>>>;

type DecorateProcedure<TProcedure extends AnyProcedure> =
  TProcedure extends AnyQueryProcedure
    ? {
        atomWithQuery: QueryResolver<TProcedure>;
      }
    : TProcedure extends AnyMutationProcedure
    ? {
        atomWithMutation: MutationResolver<TProcedure>;
      }
    : TProcedure extends AnySubscriptionProcedure
    ? {
        atomWithSubscription: SubscriptionResolver<TProcedure>;
      }
    : never;

type DecoratedProcedureRecord<TProcedures extends ProcedureRouterRecord> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? DecoratedProcedureRecord<TProcedures[TKey]['_def']['record']>
    : TProcedures[TKey] extends AnyProcedure
    ? DecorateProcedure<TProcedures[TKey]>
    : never;
};

export function createTRPCJotai<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const client = createTRPCProxyClient<TRouter>(opts);

  const createProxy = (target: any, parentProp?: string): any => {
    return new Proxy(
      {},
      {
        get(_target, prop: string) {
          return createProxy(target[prop], prop);
        },
        apply(_target, _thisArg, args) {
          if (parentProp === 'atomWithQuery') {
            const [getInput, getOptions, getProcedure] = args;
            return atomWithQuery(
              getProcedure || (() => target),
              getInput,
              getOptions,
            );
          }
          if (parentProp === 'atomWithMutation') {
            const [getProcedure] = args;
            return atomWithMutation(getProcedure || (() => target));
          }
          if (parentProp === 'atomWithSubscription') {
            const [getInput, getOptions, getProcedure] = args;
            return atomWithSubscription(
              getProcedure || (() => target),
              getInput,
              getOptions,
            );
          }
          throw new Error(`unexpected function call ${parentProp}`);
        },
      },
    );
  };

  return createProxy(client) as DecoratedProcedureRecord<
    TRouter['_def']['record']
  >;
}
