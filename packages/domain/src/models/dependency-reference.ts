/**
 * dependency-reference.ts
 *
 * Records a directional dependency between two code locations discovered during
 * analysis.  These are used by the Dependency Agent to trace how a change in
 * one branch can ripple through to code owned by another branch.
 *
 * Serialization notes
 * -------------------
 * - Direction is always `from → to` (the `from` location depends on / imports
 *   from / calls into the `to` location).
 * - `kind` is open-ended; the values below cover the most common cases but
 *   custom values are permitted (agents must handle unknown kinds gracefully).
 * - `isCrossModule` is a computed convenience flag — set to `true` when
 *   `from.filePath` and `to.filePath` reside in different packages/modules.
 */

import type { Id } from '../primitives.js';

/** The nature of the dependency relationship */
export type DependencyKind =
  /** ES/TS import statement */
  | 'IMPORT'
  /** Function or method call */
  | 'FUNCTION_CALL'
  /** One type extends or implements another */
  | 'TYPE_EXTENDS'
  /** Runtime shared state (global, singleton, context) */
  | 'SHARED_STATE'
  /** Event emitter → listener */
  | 'EVENT'
  /** Database foreign-key style relation */
  | 'DATA_REFERENCE'
  /** Any dependency that does not fit the categories above */
  | 'OTHER';

/** One side of a dependency edge — a specific symbol at a specific location */
export type DependencyEndpoint = {
  /**
   * Repository-relative path of the file.
   * Example: "src/billing/service.ts"
   */
  filePath: string;
  /**
   * Name of the symbol (function, class, variable, type) at this endpoint.
   * Null when the reference is to the module as a whole rather than a symbol.
   */
  symbolName: string | null;
  /** Branch that owns this file at the time of analysis */
  branchName: string;
};

/**
 * A directional edge in the dependency graph between two code locations.
 *
 * The `from` location USES the `to` location, so a breaking change at `to`
 * may require a fix at `from`.
 */
export type DependencyReference = {
  /** UUID v4 */
  id: Id;
  /** The location that has the dependency */
  from: DependencyEndpoint;
  /** The location being depended on */
  to: DependencyEndpoint;
  /** Nature of the dependency */
  kind: DependencyKind;
  /**
   * True when `from` and `to` are in different npm packages/modules.
   * Cross-module dependencies carry higher conflict risk because the
   * dependency boundary is an explicit API contract.
   */
  isCrossModule: boolean;
  /**
   * Human-readable explanation of why this dependency is noteworthy.
   * Example: "billing/service.ts imports checkRole from auth/roles.ts whose
   * return type changed in feature/auth."
   * Null for routine dependencies recorded for graph completeness only.
   */
  description: string | null;
};
