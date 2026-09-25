# MergeMind

> **Git tells you whether code can merge.**
> **MergeMind tells you whether the ideas behind the code can coexist.**

---

## The Problem

Software development is changing.

Developers are no longer working with just one AI coding assistant. They are beginning to use multiple agents in parallel:

- one agent changes authentication
- another modifies the database
- another builds an API
- another generates tests
- another handles deployment

Each agent may produce perfectly valid code. Each branch may compile. Every test may pass. Git may report:

> No conflicts.

And the product can still break.

Because Git understands **text**. It does not understand:

- assumptions
- business rules
- architectural decisions
- API expectations
- data contracts
- developer intent

Two AI agents can therefore make changes that are individually correct but **semantically incompatible**.

That is the new problem MergeMind solves.

---

## The Idea

MergeMind is a **semantic verification layer for parallel AI coding agents**.

Before AI-generated changes are merged, MergeMind asks:

> Do these changes still agree with each other and with the original requirement?

It uses IBM Bob agents to independently inspect:

- the original feature request
- code changes
- APIs
- database schemas
- dependencies
- documentation
- tests

Then it extracts the assumptions each change makes. MergeMind compares those assumptions and builds an **Agent Conflict Graph**.

Instead of only finding:

> File A and File B edited the same line.

MergeMind can find:

> Agent A changed the meaning of "role", but Agent B still depends on the old meaning.

That is a conflict Git cannot see.

---

## The Killer Example

A developer asks:

> Add organization billing. Only organization owners can manage subscriptions.

Two Bob tasks run in parallel.

**Authentication task** — updates the role system:

```ts
// auth/roles.ts
User.role = "owner";
```

**Billing task** — implements the billing authorization:

```ts
// billing/permissions.ts
if (user.role === "admin") {
  manageSubscription();
}
```

Both changes are technically valid.

Git:

- ✅ Merge successful
- ✅ No conflicts

Existing tests:

- ✅ 42 / 42 passing

Everything looks safe. Then MergeMind runs:

```text
SEMANTIC CONFLICT DETECTED

Requirement:
  Only organization owners may manage subscriptions.

Authentication assumption:
  Privileged role = owner

Billing assumption:
  Privileged role = admin

Affected files:
  auth/roles.ts
  billing/permissions.ts

Severity:
  HIGH
```

The code merged. The meaning did not. That is the moment judges remember.

---

## How It Works

### Step 1 — Developer gives Bob a feature

Example:

> Add organization billing with owner-only subscription management.

Bob understands the requirement and repository.

### Step 2 — Parallel Bob agents analyze the change

MergeMind launches specialized analysis tasks:

- **Intent Agent** — Understands what the developer actually requested. Extracts rules such as: *Only organization owners can manage subscriptions.*
- **Change Agent** — Analyzes the modified code and determines what behavior was introduced.
- **Contract Agent** — Looks at APIs, function signatures, schemas, types, and database models, and identifies assumptions between components.
- **Dependency Agent** — Determines which other parts of the repository depend on those assumptions.
- **Adversary Agent** — Its job is not to agree with the implementation. Its job is to ask: *"How could these changes be mutually inconsistent?"*

This gives Bob a very visible role in the product rather than simply using Bob to write our frontend.

### Step 3 — Assumption extraction

MergeMind converts agent findings into structured assumptions. For example:

**Assumption A**

- Source: `auth/roles.ts`
- Statement: The privileged organization role is `"owner"`
- Depends on: `User.role`

**Assumption B**

- Source: `billing/permissions.ts`
- Statement: The privileged organization role is `"admin"`
- Depends on: `User.role`

Now MergeMind can compare meaning, not just code.

### Step 4 — Agent Conflict Graph

MergeMind visualizes relationships between:

```text
REQUIREMENT
     │
     ↓
ASSUMPTIONS
     │
     ↓
FILES
     │
     ↓
DEPENDENCIES
     │
     ↓
TESTS
```

Example:

```text
                    REQUIREMENT
                         │
          Owners manage subscriptions
                         │
               ┌─────────┴─────────┐
               ↓                   ↓
        Authentication          Billing
               │                   │
      privileged = owner   privileged = admin
               │                   │
               └─────────┬─────────┘
                         ↓

                 SEMANTIC CONFLICT

                         ↓

                billing permission
                     may fail
```

This becomes the signature visual of the product.

---

## The Three Conflicts We Detect

For the 48-hour MVP, MergeMind focuses on only three high-value conflict classes.

### 1. Business-rule conflicts

Two agents interpret a requirement differently.

- Agent A: Owner can edit.
- Agent B: Admin can edit.

### 2. Contract conflicts

One component changes something another component depends on.

- API now returns: `userId`
- Frontend expects: `user_id`

The files may never touch each other. Git won't detect anything. MergeMind does.

### 3. Dependency conflicts

One change invalidates an assumption elsewhere.

- Agent A: Makes email optional.
- Agent B: Notification service assumes every user has email.

Again:

- Git: ✅ clean merge
- MergeMind: ⚠️ semantic dependency conflict

---

## The Second Killer Feature: Change Passport

After verification, MergeMind generates a permanent **Change Passport**.

Instead of a pull request containing only code, it also contains evidence explaining why that code should be trusted.

```text
MERGEMIND CHANGE PASSPORT

Feature:              Organization Billing
Intent:               Only organization owners may manage subscriptions.
Files Changed:        12
Components:           Authentication, Billing, Database, API
Assumptions Found:    8
Verified:             7
Conflicts Found:      2
Resolved:             2
Tests:                29 / 29
Requirement Coverage: 94%
Remaining Risk:       Webhook retry behavior not verified.
Verification Status:  PASS
```

Future developers can understand:

- what changed
- why it changed
- what assumptions exist
- what dependencies were affected
- what was verified
- what is still uncertain

And future AI agents can read the same information.

---

## Why This Is Not Another Code Reviewer

A normal AI code reviewer asks:

> Is this code good?

MergeMind asks:

> Do all the changes still describe the same system?

That is fundamentally different.

We're not trying to replace:

- GitHub
- testing
- code review
- static analysis
- AI coding assistants

We're adding a missing layer between AI coding and production.

---

## Why Now

AI development is moving toward parallel agents. One developer may soon supervise:

```text
Developer
   ↓
Agent A, Agent B, Agent C, Agent D, Agent E
```

The bottleneck is no longer only:

> Can AI generate code?

It becomes:

> Can we trust several AI agents changing one system simultaneously?

MergeMind is infrastructure for that world.

---

## Why IBM Bob Is Essential

IBM Bob is not simply a tool we use while programming MergeMind. Bob becomes part of the actual workflow.

We showcase:

- **Bob Agent Mode** — for repository and requirement analysis.
- **Parallel Tasks** — for simultaneous independent analysis.
- **Subagents** — for specialized reasoning: intent, contracts, dependencies, adversarial verification.
- **Document Understanding** — for reading PRDs, READMEs, ADRs, API specifications, and repository documentation.

This means the submission demonstrates Bob's advanced capabilities directly.

---

## What We Actually Build in 48 Hours

We deliberately avoid building a giant platform. The hackathon version has one polished workflow.

### Screen 1 — Verify Change

Developer selects:

- Repository
- Feature request
- Branches / changes

Button: **Verify with Bob**

### Screen 2 — Bob Analysis

Show agents running:

```text
Intent Agent        Complete
Contract Agent      Complete
Dependency Agent    Complete
Adversary Agent     Running
```

This makes Bob usage visible in the demo.

### Screen 3 — Conflict Graph

The product shows: **2 semantic conflicts found**

Click a conflict. Example:

- Requirement: Owner-only billing
- Authentication: `role = owner`
- Billing: `role = admin`
- Conflict: Authorization assumptions disagree

Then show the exact affected files.

### Screen 4 — Resolution

Bob proposes:

- Update billing authorization to use `"owner"`
- Add regression test: `"admin cannot manage organization subscription"`

Developer approves.

### Screen 5 — Change Passport

Show the final verification report. Done.

That is the entire MVP.

---

## The Demo (3:00)

**0:00–0:20** — Show two AI-generated branches. Say:

> AI agents increasingly work in parallel. But two agents can both write valid code and still disagree about what the software means.

**0:20–0:35** — Merge the branches. Git: *No conflicts.* Tests: *Passing.* Then say:

> Everything looks safe.

**0:35–1:20** — Run MergeMind. Bob tasks start. The Conflict Graph appears.

> HIGH SEVERITY SEMANTIC CONFLICT — Authentication uses `owner`, Billing expects `admin`.

Then:

> Git understood the text. MergeMind understood the intent.

**1:20–1:50** — Show the requirement that caused the conflict. Show the exact assumptions. Show dependency tracing.

**1:50–2:15** — Bob generates the missing regression test. Run tests.

- Before: 42 tests passing
- After: 43 tests passing

**2:15–2:40** — Show the Change Passport. Conflict resolved, requirement verified, dependencies verified, tests verified.

**2:40–3:00** — Finish with:

> Git tells developers whether code can merge. MergeMind tells AI agents whether their decisions can coexist.

---

## The Measurable Result

We benchmark semantic verification manually versus MergeMind.

| Metric | Manual review | MergeMind |
| --- | --- | --- |
| Verification time | 27 minutes | 3 minutes 40 seconds |

We can also show:

- Semantic conflicts found: 3
- Missing regression tests found: 2
- Cross-component dependencies identified: 7
- Verification time reduced: 86%

That gives judges actual impact instead of only an AI demo.

---

## Why Developers Would Use It

Today:

```text
Developer → AI Agent → Code → Git → Review → Production
```

Tomorrow:

```text
Developer → Many AI Agents → Many Changes → MergeMind → Verified Change → Production
```

MergeMind becomes the trust layer between autonomous development and production.

---

## Future Vision

Eventually MergeMind could work across:

- IBM Bob
- Codex
- Claude Code
- Cursor
- Copilot
- Kiro
- custom coding agents

Every AI-generated change gets a machine-readable history containing:

```text
INTENT
ASSUMPTIONS
DEPENDENCIES
EVIDENCE
TESTS
UNRESOLVED RISKS
```

So another agent months later doesn't only receive:

> Here is the code.

It receives:

> Here is why the code exists and what must remain true for it to stay correct.

---

## Final Positioning

**MergeMind — The verification layer for multi-agent software development.**

Git catches code conflicts. MergeMind catches meaning conflicts.

And our central question is:

> When five AI agents write your software, who checks that they still agree with each other?

**MergeMind does.**

---

## Team Integration Contract

This branch is the stable foundation. Teammates branch from here and merge back
without breaking each other. Rules below are binding until the demo ships.

### Quick start (teammate clone → running)

```bash
pnpm install        # requires Node >= 18, pnpm >= 11
pnpm check          # build + typecheck + lint + format:check + test — must be green
pnpm dev            # Next.js app on http://localhost:3000 (see .env.example)
```

Health probes: `GET /health` and tRPC `health.check`.

### Where new modules live

| Work | Location | Notes |
|---|---|---|
| Real conflict detectors | `packages/verification/src/` — implement `ConflictDetector`, inject into `runVerification()` | `StubConflictDetector` stays as the fallback |
| Bob subagent runners | `packages/analysis/src/` — implement `AgentRunner` per agent, register in `AnalysisPipeline.create()` | Stubs stay until your branch lands |
| New repo sources | `packages/git-ingest/src/adapters/` — implement `IngestAdapter` (+ `GitRunner` for shell) | Keep shell behind `GitRunner` so tests stay mockable |
| Conflict graph UI | `apps/web/src/` new screens/components | `VerifyForm` + `page.tsx` (Screen 1) are the composition root |
| Resolution workflow | New tRPC sub-router in `packages/api/src/index.ts` (see `EXTENSION POINT` comment) | Keep `health` + `verify` namespaces stable |
| Passport generation | New service/branch — only the `ChangePassportDraft` **type** exists so far | Do not invent a second passport shape |
| Test data | `packages/fixtures/` (`getScenario()`, `allScenarios`) for detector/passport tests; `@mergemind/domain/testing` factories and `@mergemind/git-ingest/testing` builders for unit tests | Raw snapshots live in `fixtures/` (demo repo) and `apps/web/src/fixtures/` (UI seed) — do not fork new copies without need |

### Shared types to reuse (do not duplicate)

`FeatureRequest`, `RepositorySource`, `ChangedFile`, `CodeEvidence`, `Assumption`,
`ConflictFinding`, `VerificationResult`, `ChangePassportDraft` — all from
`@mergemind/domain`, validated at runtime by `@mergemind/domain/schemas`.
Deprecated aliases (`FeatureRequirement`, `RepositoryContext`, `FileDiff`,
`SemanticConflict`) exist for backward compatibility only — new code must use
the canonical names.

### Stable interfaces (avoid changing unless necessary)

- `packages/domain` types + zod schemas (every package breaks on field changes)
- `IngestAdapter`, `AgentRunner`, `ConflictDetector` contracts
- tRPC `health.*` / `verify.*` procedure names and the `AppRouter` type
- `pnpm check` gate set and CI workflow (`.github/workflows/ci.yml`)

### Commands that must pass before merge

```bash
pnpm check   # = build && typecheck && lint && format:check && test
```

CI runs the same sequence on every push/PR. A red gate blocks merge — fix the
baseline you touched; never weaken a gate to make it pass.

### What is deliberately NOT built yet

Semantic conflict detection, Bob multi-agent orchestration, conflict-graph UI,
automated resolution, and Change Passport generation exist here as **types,
interfaces, and stubs only**. Do not mistake them for implementations — the
feature branches own them.
