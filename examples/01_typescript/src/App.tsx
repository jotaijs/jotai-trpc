import React, { Suspense, useState } from 'react';
import { atom, useAtom } from 'jotai';
import { createAtomCreators } from 'jotai-trpc';

import { AppRouter } from './server';

const { atomWithQuery } = createAtomCreators<AppRouter>({
  url: 'http://localhost:4000/trpc',
});

const nameAtom = atom('name');

const greetAtom = atomWithQuery((get) => ['greet', get(nameAtom)]);

const Greet = () => {
  const [data] = useAtom(greetAtom);
  return <p>{data.message}</p>;
};

const App = () => {
  const [name, setName] = useAtom(nameAtom);
  const [text, setText] = useState(name);
  return (
    <div>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" onClick={() => setName(text)}>
        Fetch
      </button>
      <hr />
      <Suspense fallback="Loading...">
        <Greet />
      </Suspense>
    </div>
  );
};

export default App;
