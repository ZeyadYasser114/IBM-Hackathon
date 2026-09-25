import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@mergemind/api';

/**
 * Next.js App Router API route handler for all tRPC calls.
 * Mounted at /api/trpc/[trpc].
 *
 * EXTENSION POINT
 * ---------------
 * Add context (e.g. auth session, DB connection) by implementing a
 * `createContext` function and passing it here:
 *
 *   async function createContext({ req }: FetchCreateContextFnOptions) {
 *     return { session: await getSession(req) };
 *   }
 *   handler = fetchRequestHandler({ ..., createContext });
 */
const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => ({}),
  });

export { handler as GET, handler as POST };
