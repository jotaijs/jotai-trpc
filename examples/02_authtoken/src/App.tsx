import React, { Suspense } from 'react';
import { atom, useAtom } from 'jotai';
import { createTRPCClient, httpLink } from '@trpc/client';
import { createAtomCreators } from 'jotai-trpc';
import { trpcPokemonUrl } from 'trpc-pokemon';
import type { PokemonRouter } from 'trpc-pokemon';
import { ErrorBoundary } from 'react-error-boundary';
import type { FallbackProps } from 'react-error-boundary';

const { atomWithQuery } = createAtomCreators<PokemonRouter>({
  links: [
    httpLink({
      url: trpcPokemonUrl,
    }),
  ],
});

const tokenAtom = atom('');

const clientAtom = atom((get) =>
  createTRPCClient<PokemonRouter>({
    links: [
      httpLink({
        url: get(tokenAtom) ? trpcPokemonUrl : 'Invalid URL',
        headers: {
          Authorization: `Bearer ${get(tokenAtom)}`,
        },
      }),
    ],
  }),
);

const pokemonAtom = atomWithQuery('pokemon.all', [], undefined, (get) =>
  get(clientAtom),
);

const Pokemon = () => {
  const [data] = useAtom(pokemonAtom);
  return (
    <ul>
      {data.map((item) => (
        <li>
          <div>ID: {item.id}</div>
          <div>Height: {item.height}</div>
          <div>Weight: {item.weight}</div>
        </li>
      ))}
    </ul>
  );
};

const Fallback = ({ error, resetErrorBoundary }: FallbackProps) => {
  const retry = () => {
    resetErrorBoundary();
  };
  return (
    <div role="alert">
      <p>Something went wrong:</p>
      <pre>{error.message}</pre>
      <button type="button" onClick={retry}>
        Try again
      </button>
    </div>
  );
};

const App = () => {
  const [token, setToken] = useAtom(tokenAtom);
  return (
    <div>
      {token ? (
        <p>Auth token is set.</p>
      ) : (
        <button type="button" onClick={() => setToken('dummy')}>
          Set auth token
        </button>
      )}
      <hr />
      <h1>List of Pokemon</h1>
      <ErrorBoundary FallbackComponent={Fallback}>
        <Suspense fallback="Loading...">
          <Pokemon />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
};

export default App;
