import { Suspense } from 'react';
import { useAtom } from 'jotai/react';
import {atom, type Getter} from 'jotai/vanilla';
import { httpLink } from '@trpc/client';
import { trpcPokemonUrl } from 'trpc-pokemon';
import type { PokemonRouter } from 'trpc-pokemon';
import { createTRPCJotai } from 'jotai-trpc';

const trpc = createTRPCJotai<PokemonRouter>({
  links: [
    httpLink({
      url: trpcPokemonUrl,
    }),
  ],
});

const NAMES = [
  'bulbasaur',
  'ivysaur',
  'venusaur',
  'charmander',
  'charmeleon',
  'charizard',
  'squirtle',
  'wartortle',
  'blastoise',
];

const nameAtom = atom(NAMES[0] as string);

const pokemonAtom = trpc.pokemon.byId.atomWithQuery((get: Getter) => get(nameAtom));

const Pokemon = () => {
  const [data] = useAtom(pokemonAtom);
  return (
    <div>
      <div>ID: {data.id}</div>
      <div>Height: {data.height}</div>
      <div>Weight: {data.weight}</div>
    </div>
  );
};

const App = () => {
  const [name, setName] = useAtom(nameAtom);
  return (
    <div>
      <select value={name} onChange={(e) => setName(e.target.value)}>
        {NAMES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <hr />
      <Suspense fallback="Loading...">
        <Pokemon />
      </Suspense>
    </div>
  );
};

export default App;
