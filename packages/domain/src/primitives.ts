/**
 * primitives.ts
 *
 * Scalar type aliases shared across every domain model.
 * Using branded aliases (rather than plain `string`) keeps call-sites readable
 * and makes future nominal-typing migration straightforward.
 */

/** ISO-8601 UTC date-time string, e.g. "2024-08-01T12:00:00.000Z" */
export type ISODateString = string;

/**
 * Universally unique identifier (UUID v4 by convention).
 * Use `crypto.randomUUID()` or `uuid` library to generate.
 */
export type Id = string;

/**
 * Semantic version string following SemVer, e.g. "1.2.3".
 * Used for passport schema versions and package versions.
 */
export type SemVer = string;
