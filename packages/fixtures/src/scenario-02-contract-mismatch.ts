/**
 * scenario-02-contract-mismatch.ts
 *
 * SCENARIO 2 — Contract mismatch
 * ─────────────────────────────────────────────────────────────────────────────
 * Original requirement
 *   "Implement an activity-feed service that records actions performed by users.
 *    The event payload must include the acting user's identifier."
 *
 * What each parallel branch did
 *   Branch A (feature/events-api-refactor)
 *     – Modernised the shared event payload type, renaming the user identifier
 *       field from the legacy snake_case "user_id" to camelCase "userId" for
 *       consistency with the rest of the TypeScript codebase.
 *
 *   Branch B (feature/activity-feed)
 *     – Added the activity-feed consumer. Because it was branched from main
 *       before Branch A's refactor landed, it still reads "user_id" from every
 *       incoming event object.
 *
 * Why Git is silent
 *   Branch A touches src/events/payload.ts (type definition).
 *   Branch B touches src/activity-feed/handler.ts (consumer).
 *   No line overlaps anywhere — clean merge.
 *
 * Contradiction
 *   After merge, every event emitted by the platform populates "userId" but the
 *   activity-feed handler reads "user_id", which is always undefined.  Every
 *   activity record is created with an undefined actor — data integrity failure,
 *   no runtime error, no failing test.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ScenarioFixture } from './types.js';

// ---------------------------------------------------------------------------
// Base-branch files (common ancestor)
// ---------------------------------------------------------------------------

const BASE_PAYLOAD_TS = `\
/**
 * Shared event payload emitted by all platform services.
 */
export interface EventPayload {
  /** Legacy snake_case identifier for the acting user */
  user_id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  occurredAt: string;
}
`;

const BASE_HANDLER_TS = `\
import type { EventPayload } from '../events/payload.js';

// Activity-feed handler — stub on base branch
export function handleEvent(_event: EventPayload): void {
  // TODO: implement
}
`;

// ---------------------------------------------------------------------------
// Branch A — events-api-refactor
// ---------------------------------------------------------------------------

const BRANCH_A_PAYLOAD_TS = `\
/**
 * Shared event payload emitted by all platform services.
 * Field renamed user_id → userId for camelCase consistency.
 */
export interface EventPayload {
  /** camelCase user identifier — replaces legacy user_id */
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  occurredAt: string;
}
`;

const PATCH_A = `\
--- a/src/events/payload.ts
+++ b/src/events/payload.ts
@@ -1,8 +1,8 @@
 /**
  * Shared event payload emitted by all platform services.
+ * Field renamed user_id → userId for camelCase consistency.
  */
 export interface EventPayload {
-  /** Legacy snake_case identifier for the acting user */
-  user_id: string;
+  /** camelCase user identifier — replaces legacy user_id */
+  userId: string;
   action: string;
   resourceType: string;
   resourceId: string;
`;

// ---------------------------------------------------------------------------
// Branch B — activity-feed
// ---------------------------------------------------------------------------

const BRANCH_B_HANDLER_TS = `\
import type { EventPayload } from '../events/payload.js';

export interface ActivityRecord {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  recordedAt: string;
}

/**
 * Converts an incoming platform event into an activity-feed record.
 *
 * CONTRACT BUG: reads event.user_id, but Branch A renamed that field to userId.
 * After merge, actorId will always be undefined — silently corrupt data.
 */
export function handleEvent(event: EventPayload): ActivityRecord {
  return {
    actorId: (event as unknown as Record<string, string>)['user_id'] ?? '',
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    recordedAt: event.occurredAt,
  };
}
`;

const PATCH_B = `\
--- a/src/activity-feed/handler.ts
+++ b/src/activity-feed/handler.ts
@@ -1,5 +1,22 @@
 import type { EventPayload } from '../events/payload.js';
 
-// Activity-feed handler — stub on base branch
-export function handleEvent(_event: EventPayload): void {
-  // TODO: implement
+export interface ActivityRecord {
+  actorId: string;
+  action: string;
+  resourceType: string;
+  resourceId: string;
+  recordedAt: string;
+}
+
+/**
+ * Converts an incoming platform event into an activity-feed record.
+ *
+ * CONTRACT BUG: reads event.user_id, but Branch A renamed that field to userId.
+ * After merge, actorId will always be undefined — silently corrupt data.
+ */
+export function handleEvent(event: EventPayload): ActivityRecord {
+  return {
+    actorId: (event as unknown as Record<string, string>)['user_id'] ?? '',
+    action: event.action,
+    resourceType: event.resourceType,
+    resourceId: event.resourceId,
+    recordedAt: event.occurredAt,
+  };
 }
`;

// ---------------------------------------------------------------------------
// Canonical VerificationResult
// ---------------------------------------------------------------------------

export const scenario02ContractMismatch: ScenarioFixture = {
  id: 'scenario-02-contract-mismatch',
  title: 'Event payload field rename: userId (emitter) vs user_id (consumer)',
  originalRequirement:
    'Implement an activity-feed service that records actions performed by users. ' +
    'The event payload must include the acting user\'s identifier.',
  conflictCategory: 'CONTRACT',

  baseFiles: [
    { path: 'src/events/payload.ts', content: BASE_PAYLOAD_TS },
    { path: 'src/activity-feed/handler.ts', content: BASE_HANDLER_TS },
  ],

  branches: [
    {
      name: 'feature/events-api-refactor',
      changedFiles: [{ path: 'src/events/payload.ts', content: BRANCH_A_PAYLOAD_TS }],
      patch: PATCH_A,
    },
    {
      name: 'feature/activity-feed',
      changedFiles: [{ path: 'src/activity-feed/handler.ts', content: BRANCH_B_HANDLER_TS }],
      patch: PATCH_B,
    },
  ],

  expectedContradiction:
    'Branch feature/events-api-refactor renamed the user identifier field from "user_id" to ' +
    '"userId" in the shared EventPayload type (src/events/payload.ts). Branch ' +
    'feature/activity-feed reads "user_id" from every incoming event ' +
    '(src/activity-feed/handler.ts). After merge the activity-feed handler receives events ' +
    'where "user_id" is undefined, so every ActivityRecord is created with an empty actorId ' +
    '— silent data corruption with no runtime error.',

  expectedAffectedFiles: ['src/events/payload.ts', 'src/activity-feed/handler.ts'],

  expectedAffectedComponents: ['events', 'activity-feed'],

  canonicalResult: {
    id: 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e7',
    schemaVersion: '1.0.0',
    featureRequest: {
      id: 'c3d4e5f6-a7b8-4c9d-0e1f-a2b3c4d5e6f8',
      title: 'Activity-feed service',
      description:
        'Implement an activity-feed service that records actions performed by users. ' +
        "The event payload must include the acting user's identifier.",
      acceptanceCriteria: [
        { key: 'AC-1', description: 'Every activity record stores the acting user identifier.' },
        {
          key: 'AC-2',
          description: 'Activity records are created from incoming platform events.',
        },
      ],
      rules: [
        'Event payload must carry a user identifier',
        'Activity-feed consumer must read the identifier from the canonical field name',
      ],
      tags: ['activity-feed', 'events', 'contract'],
      createdAt: '2024-08-02T09:00:00.000Z',
      submittedBy: 'demo@example.com',
    },
    repositorySource: {
      id: 'd4e5f6a7-b8c9-4d0e-1f2a-b3c4d5e6f7a9',
      name: 'acme-platform',
      cloneUrl: 'https://github.com/acme-demo/acme-platform',
      provider: 'github',
      baseBranch: {
        name: 'main',
        sha: '1111111111111111111111111111111111111111',
      },
      featureBranches: [
        {
          name: 'feature/events-api-refactor',
          sha: 'cccccccccccccccccccccccccccccccccccccccc',
        },
        {
          name: 'feature/activity-feed',
          sha: 'dddddddddddddddddddddddddddddddddddddddd',
        },
      ],
      resolvedAt: '2024-08-02T09:00:00.000Z',
    },
    status: 'FAIL',
    startedAt: '2024-08-02T09:00:00.000Z',
    completedAt: '2024-08-02T09:05:00.000Z',
    assumptions: [
      {
        id: 'e5f6a7b8-c9d0-4e1f-2a3b-c4d5e6f7a8ba',
        branchName: 'feature/events-api-refactor',
        sourceFile: 'src/events/payload.ts',
        statement: 'The acting-user field in EventPayload is named "userId" (camelCase)',
        concept: 'event-payload-user-field-name',
        value: '"userId"',
        sourceAgent: 'contract',
        evidence: [
          {
            source: 'SOURCE_CODE',
            filePath: 'src/events/payload.ts',
            lineStart: 5,
            lineEnd: 5,
            snippet: '  userId: string;',
            branchName: 'feature/events-api-refactor',
            metadata: { symbolKind: 'PropertySignature', symbolName: 'userId' },
          },
        ],
        confidence: 'HIGH',
        numericConfidence: 0.98,
        relatedAssumptionIds: ['f6a7b8c9-d0e1-4f2a-3b4c-d5e6f7a8b9cb'],
        extractedAt: '2024-08-02T09:01:00.000Z',
      },
      {
        id: 'f6a7b8c9-d0e1-4f2a-3b4c-d5e6f7a8b9cb',
        branchName: 'feature/activity-feed',
        sourceFile: 'src/activity-feed/handler.ts',
        statement: 'The activity-feed handler reads the user identifier from event["user_id"]',
        concept: 'event-payload-user-field-name',
        value: '"user_id"',
        sourceAgent: 'contract',
        evidence: [
          {
            source: 'SOURCE_CODE',
            filePath: 'src/activity-feed/handler.ts',
            lineStart: 19,
            lineEnd: 19,
            snippet: "    actorId: (event as unknown as Record<string, string>)['user_id'] ?? '',",
            branchName: 'feature/activity-feed',
            metadata: { symbolKind: 'FunctionDeclaration', symbolName: 'handleEvent' },
          },
        ],
        confidence: 'HIGH',
        numericConfidence: 0.96,
        relatedAssumptionIds: ['e5f6a7b8-c9d0-4e1f-2a3b-c4d5e6f7a8ba'],
        extractedAt: '2024-08-02T09:02:00.000Z',
      },
    ],
    conflicts: [
      {
        id: 'a7b8c9d0-e1f2-4a3b-4c5d-e6f7a8b9c0d2',
        title: 'Event payload field name mismatch: "userId" (emitter) vs "user_id" (consumer)',
        description:
          'feature/events-api-refactor renamed EventPayload.user_id → EventPayload.userId ' +
          '(src/events/payload.ts). feature/activity-feed reads event["user_id"] to populate ' +
          'ActivityRecord.actorId (src/activity-feed/handler.ts:19). After merge every activity ' +
          'record is created with actorId = "" because the field "user_id" no longer exists on ' +
          'the emitted payload. No TypeScript error surfaces because the access is cast to ' +
          'Record<string, string>.',
        severity: 'HIGH',
        category: 'CONTRACT',
        affectedAssumptionIds: [
          'e5f6a7b8-c9d0-4e1f-2a3b-c4d5e6f7a8ba',
          'f6a7b8c9-d0e1-4f2a-3b4c-d5e6f7a8b9cb',
        ],
        affectedFiles: ['src/activity-feed/handler.ts', 'src/events/payload.ts'],
        conflictEvidence: [
          {
            source: 'SOURCE_CODE',
            filePath: 'src/activity-feed/handler.ts',
            lineStart: 18,
            lineEnd: 21,
            snippet:
              '  return {\n' +
              "    actorId: (event as unknown as Record<string, string>)['user_id'] ?? '',\n" +
              '    action: event.action,\n' +
              '    ...',
            branchName: 'feature/activity-feed',
            metadata: {},
          },
        ],
        proposedResolution: null,
        resolvedAt: null,
      },
    ],
    summary: {
      assumptionsFound: 2,
      conflictsFound: 1,
      conflictsResolved: 0,
      filesChanged: 2,
      requirementCoverage: 50,
      conflictsBySeverity: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0 },
    },
    errorMessage: null,
  },
};
