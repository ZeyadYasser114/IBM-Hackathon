/**
 * lib/env.ts — validated environment-variable access for the web app.
 *
 * All `process.env` reads outside this module are a code smell: add the
 * variable here with a Zod schema so misconfiguration fails fast with a
 * message that tells the developer exactly what to set.
 *
 * Client-safe: only plain strings with safe fallbacks are exposed. Never put
 * secrets in this module — anything imported by client components ships to
 * the browser.
 */

import { z } from 'zod';

const ServerEnvSchema = z.object({
  /**
   * Port for local `next dev` / `next start`. Defaults to 3000.
   * Must be a valid TCP port number when set.
   */
  PORT: z
    .string()
    .regex(/^\d+$/, { message: 'PORT must be a number, e.g. PORT=3000' })
    .transform(Number)
    .refine((port) => port > 0 && port < 65536, {
      message: 'PORT must be between 1 and 65535',
    })
    .optional()
    .default('3000')
    .transform((port) => Number(port)),
  /**
   * Set automatically by Vercel deployments (e.g. "my-app.vercel.app").
   * Absent in local development — that is normal, not an error.
   */
  VERCEL_URL: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/**
 * Parse and validate `process.env` once at startup.
 * @throws {Error} with a human-readable message when a variable is invalid.
 */
function parseServerEnv(): ServerEnv {
  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(
      `Invalid environment configuration. Check your .env file (see .env.example):\n${details.join('\n')}`,
    );
  }
  return parsed.data;
}

/** Validated server environment — import this instead of reading process.env. */
export const env: ServerEnv = parseServerEnv();

/**
 * Base URL for tRPC calls. Returns '' in the browser (relative URLs) and an
 * absolute URL during server-side rendering.
 */
export function getBaseUrl(): string {
  if (typeof window !== 'undefined') return '';
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return `http://localhost:${env.PORT}`;
}
