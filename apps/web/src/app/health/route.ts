/**
 * /health — server-side health check page
 *
 * Returns the health check response from the tRPC router as a JSON response.
 * Use this as the startup probe:
 *
 *   curl http://localhost:3000/health
 *
 * EXTENSION POINT
 * ---------------
 * Add database connectivity, external service pings, and feature flag status
 * to the health check body here.
 */
import { appRouter } from '@mergemind/api';
import { NextResponse } from 'next/server';

export async function GET() {
  const caller = appRouter.createCaller({});
  const health = await caller.health.check();
  return NextResponse.json(health);
}
