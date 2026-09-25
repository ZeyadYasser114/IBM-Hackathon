/**
 * tRPC client configuration for the Next.js app.
 *
 * This file wires the frontend tRPC client to the AppRouter type from
 * @mergemind/api, giving full end-to-end type safety from server procedure
 * to React component prop.
 */
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@mergemind/api';

export const trpc = createTRPCReact<AppRouter>();
