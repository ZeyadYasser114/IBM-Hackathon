# MergeMind

> **Git tells you whether code can merge.
> MergeMind tells you whether the *ideas* behind the code can coexist.**

Semantic verification layer for parallel AI coding agents.

---

## What is MergeMind?

When multiple AI agents develop code in parallel, each agent may produce perfectly valid code, Git may report no conflicts, and all tests may pass — yet the product can still break because the *meanings* of the changes disagree.

MergeMind is a semantic verification layer that:

1. **Ingests real repository diffs** from a public GitHub URL (source text only — repository code is never executed)
2. **Extracts assumptions** from the changes and the original feature requirement
3. **Detects semantic conflicts** — business-rule, contract, and dependency disagreements that Git cannot see
4. **Generates a Conflict Graph** — a visual map of how the changes relate to each other
5. **Issues a Change Passport** — a permanent, machine-readable record containing only genuinely measured values

---

## How it works

The engine extracts structured assumptions — authorization rules, business rules, contracts, and dependencies — normalizes them into canonical predicates, classifies pairwise contradictions, and assigns severity and confidence through explicit named rules. Every finding becomes a ConflictReport with both evidence sides, a plain-language explanation of why the assumptions cannot coexist, the affected files, and a concrete verification hint.

Results flow back into the `/demo` experience: live Analysis progress, a Conflict Graph built from the real report, Conflict Detail showing actual assumption clashes and evidence excerpts, a suggested resolution derived from the engine's verification hint, and a Change Passport containing only genuinely measured values. Unmeasured metrics honestly render as "Not measured."

---

## The Killer Example

A developer asks:
> *"Add organization billing. Only organization owners can manage subscriptions."*

Two parallel changes:

**Change A (`feature/auth-roles`):**
```ts
// auth/roles.ts
User.role = 'owner';
```

**Change B (`feature/billing-permissions`):**
```ts
// billing/permissions.ts
if (user.role === 'admin') {
  return manageSubscription();
}
```

**Git:** `✓ Merge successful — No conflicts`

Then MergeMind runs:

```
SEMANTIC CONFLICT DETECTED

Requirement:  Only organization owners may manage subscriptions.
Auth assumes: privileged role = "owner"      (auth/roles.ts)
Billing checks: role === "admin"             (billing/permissions.ts)

Severity: HIGH (BUSINESS_RULE)
```

The code merged. **The meaning did not.**

---

## Architecture

```
mergemind/
├── apps/
│   ├── ui/           ← React + Vite frontend (demo flow is the app)
│   └── api/          ← Express API server (:4000)
├── packages/
│   ├── semantic-engine/  ← Deterministic conflict detection (no LLM required)
│   ├── git-ingest/       ← Local + remote GitHub ingestion, evidence builder
│   ├── domain/           ← Shared schemas & types (incl. ChangePassportDraft)
│   ├── analysis/         ← Analysis pipeline orchestration (AgentRunner seam)
│   ├── verification/     ← Verification result assembly
│   ├── fixtures/         ← Deterministic scenario fixtures (tests + offline fallback)
│   ├── api/              ← tRPC router (health, verify)
│   └── mcp-server/       ← MergeMind verification as MCP tools for IBM Bob
```

### Real pipeline

```
/demo/verify (GitHub URL + base + change A + change B + requirement)
        │
        │ Verify with Bob
        ▼
POST /api/verify → real session (PENDING → INGESTING → ANALYZING → VERIFYING → COMPLETE/ERROR)
        │
        ├── GitHub ingestion (clone/fetch/diff as text only, temp cleanup)
        │
        └── deterministic semantic engine → ConflictReport[]
                │
        ┌───────┼────────┐
        ▼       ▼        ▼
      Graph   Detail   Passport (measured values only)
```

### API Server (`apps/api`)

```
POST /api/verify            → starts async analysis, returns sessionId
GET  /api/session/:id       → poll for results
POST /api/session/:id/merge → record that the developer merged with Git (COMPLETE only)
GET  /api/health            → health check
```

Merging is attestation only: MergeMind records the decision, it never modifies the source repository.

### MCP server (`packages/mcp-server`)

MergeMind verification as MCP tools, so IBM Bob can call it directly:

```
verify_text_changes       → verify two caller-supplied changes (no network)
verify_github_repository  → clone a public GitHub repo and verify two refs
```

```json
{ "mcpServers": { "mergemind": { "command": "node",
    "args": ["<repo>/packages/mcp-server/dist/index.js"] } } }
```

Scope: officially in scope and tested (`pnpm --filter @mergemind/mcp-server test`).
Owned by the integration track; both tools run the same deterministic engine as
the API — findings are never invented. Requires `pnpm build` first (stdio entry
is `dist/index.js`).

---

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 11+ (`corepack enable`, or `npm i -g pnpm@12.6.0` to match `packageManager`)

### Install (once, from the repo root)

```bash
pnpm install
```

### Run everything (one command)

```bash
pnpm demo
# → API http://localhost:4000, UI http://localhost:5173 (proxies /api to :4000)
# → Open http://localhost:5173/demo/verify — the demo is the app
```

Enter any public GitHub repository, base branch, two changes, and the requirement, then **Verify with Bob** and follow the flow — Graph, Detail, Resolution, Passport, Complete.

### Build and verify

```bash
pnpm build
pnpm check
# → build + typecheck + lint + format:check + test
```

---

## Three Conflict Classes

### 1 — Business-rule conflict
Two changes interpret a requirement differently.
*Example: Auth assigns `role="owner"`, Billing checks `role==="admin"`.*

### 2 — Contract conflict
One component changes something another depends on.
*Example: API returns `userId`, Frontend expects `user_id`.*

### 3 — Dependency conflict
One change invalidates an assumption elsewhere.
*Example: Email made optional in DB, Notification service assumes every user has email.*

---

## Technology Stack

- **Runtime / Languages:** TypeScript throughout, Node.js 18+
- **Frontend (`apps/ui`):** React 18, React Router 6, Vite 5, hand-rolled SVG graph canvas
- **API server (`apps/api`):** Express 4, execFile-only Git access, in-memory session store with a PENDING → INGESTING → ANALYZING → VERIFYING → COMPLETE/ERROR lifecycle
- **Semantic engine (`packages/semantic-engine`):** Deterministic pipeline — extractor + rule patterns → normalization → conflict detection → ConflictReport; fully unit-tested, zero LLM calls
- **Repository ingestion (`packages/git-ingest`):** Local and remote GitHub ingestion with allowlisted URLs, timeouts, diff/file caps, and guaranteed temp cleanup
- **Domain & contracts (`packages/domain`, `packages/fixtures`):** Zod-validated models, deterministic test factories, three canonical conflict scenarios
- **Tooling:** pnpm workspaces, Jest + ts-jest, ESLint, Prettier, tsc typechecks
- **IBM Bob:** The product's analysis pipeline mirrors Bob's parallel-subagent architecture — five specialized dimensions (Intent, Change, Contract, Dependency, Adversary) run over the ingested diffs. The AgentRunner interface in packages/analysis is the extension point where real Bob subagent runners plug in. Bob agents produce the changes; MergeMind verifies the ideas behind them can coexist.

---

*MergeMind — Powered by IBM Bob*
