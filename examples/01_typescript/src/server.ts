import * as trpc from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';
import { z } from 'zod';

const appRouter = trpc.router().query('greet', {
  input: z.string(),
  async resolve(req) {
    return { message: `Hello ${req.input.toUpperCase()}!` };
  },
});

// export type definition of API
export type AppRouter = typeof appRouter;

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  setTimeout(next, 1000);
});

// created for each request
const createContext = () => ({}); // no context

app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

app.listen(4000);
