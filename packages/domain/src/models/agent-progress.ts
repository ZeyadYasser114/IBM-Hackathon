/**
 * agent-progress.ts
 *
 * Tracks the lifecycle progress of a single analysis agent within a pipeline
 * run.  Progress records are emitted incrementally and used to drive live UI
 * updates (e.g. the Screen 2 progress panel via SSE or WebSocket).
 *
 * Serialization notes
 * -------------------
 * - `startedAt` is null until the agent transitions to 'running'.
 * - `completedAt` is null until the agent reaches 'complete' or 'failed'.
 */

import type { ISODateString } from '../primitives.js';
import type { AgentType, AgentStatus } from '../enums.js';

/**
 * A snapshot of one agent's progress at a point in time.
 * Multiple snapshots are emitted per agent during a run.
 */
export type AgentProgress = {
  /** The type of agent this progress record belongs to */
  agentType: AgentType;
  /** Current lifecycle status of this agent */
  status: AgentStatus;
  /**
   * When this agent started executing (ISO-8601 UTC).
   * Null while the agent is idle (not yet started).
   */
  startedAt: ISODateString | null;
  /**
   * When this agent reached a terminal status (ISO-8601 UTC).
   * Null while still running.
   */
  completedAt: ISODateString | null;
  /**
   * Brief human-readable status message for display in the UI.
   * Examples: "Extracting business rules…", "Done — 3 assumptions found"
   */
  message: string;
};
