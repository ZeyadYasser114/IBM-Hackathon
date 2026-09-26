# MergeMind

> **Git tells you whether code can merge.  
> MergeMind tells you whether the *ideas* behind the code can coexist.**

IBM TechXchange Hackathon 2024 — Semantic Verification Layer for Parallel AI Coding Agents.

---

## What is MergeMind?

When multiple AI agents develop code in parallel, each agent may produce perfectly valid code, Git may report no conflicts, and all tests may pass — yet the product can still break because the *meanings* of the changes disagree.

MergeMind is a semantic verification layer that:
1. **Extracts assumptions** from code changes and the original feature requirement  
2. **Detects semantic conflicts** — business-rule, contract, and dependency disagreements that Git cannot see  
3. **Generates an Agent Conflict Graph** — a visual map of how AI-generated changes relate to each other  
4. **Issues a Change Passport** — a permanent, machine-readable record of what was verified, what conflicts were found, and what risk remains

---

## The Killer Example

A developer asks:  
> *"Add organization billing. Only organization owners can manage subscriptions."*

Two Bob tasks run in parallel:

**Authentication task:**
```ts
// auth/roles.ts
export const ORG_PRIVILEGED_ROLE = 'owner';
User.role = ORG_PRIVILEGED_ROLE;
```

**Billing task:**
```ts
// billing/permissions.ts
if (user.role === 'admin') {
  manageSubscription();
}
```

**Git:** `✓ Merge successful — No conflicts`  
**Tests:** `✓ 42 / 42 passing`

Then MergeMind runs:

```
SEMANTIC CONFLICT DETECTED

Requirement:  Only organization owners may manage subscriptions.
Auth assumes: privileged role = "owner"
Billing checks: role === "admin"

Affected files: auth/roles.ts  ·  billing/permissions.ts
Severity: HIGH
```

The code merged. **The meaning did not.**

---

## Architecture

```
mergemind/
├── apps/
│   ├── ui/           ← React + Vite frontend (5 screens + demo flow)
│   └── api/          ← Express API server
├── packages/
│   └── semantic-engine/  ← Deterministic conflict detection (no LLM required)
```

### Frontend (`apps/ui`)

Built from the **ziad-conflict-graph-ui** branch — a polished React 18 + Vite application with:

- **Screen 1 — Verify Change**: Enter repository, feature request, branch names
- **Screen 2 — Bob Analysis**: Live progress of 5 parallel Bob agents (Intent, Change, Contract, Dependency, Adversary)
- **Screen 3 — Conflict Graph**: SVG conflict graph with scenario selector and Git vs MergeMind comparison
- **Screen 4 — Conflict Detail**: Full evidence, assumption clash, Bob-proposed resolution
- **Screen 5 — Change Passport**: Permanent verification record with JSON export

Also includes a **guided judge demo flow** at `/demo` — 10 story beats, auto-advancing agents, complete narration cues.

### Semantic Engine (`packages/semantic-engine`)

Built from the **hassan-dev** branch — a pure TypeScript, zero-LLM conflict detection engine:

- **Extraction Pipeline**: Parses feature requirements and code diffs using regex patterns to extract `SemanticAssumption` records
- **Normalization Layer**: Canonicalizes entity names, predicates, and values for comparison
- **Conflict Detector**: Groups normalized assumptions by shared subject and detects value mismatches
- **Report Builder**: Produces explainable `ConflictReport` objects with full evidence chains

### API Server (`apps/api`)

Express REST API that orchestrates the semantic engine:

```
POST /api/verify        → starts async analysis, returns sessionId
GET  /api/session/:id   → poll for results
GET  /api/health        → health check
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+

### Run the frontend (demo mode — fully standalone)

```bash
cd apps/ui
npm install
npm run dev
# → http://localhost:5173
# → Navigate to /demo for the judge demo flow
```

### Run both frontend and API server

```bash
# Terminal 1 — API server
cd apps/api
npm install
npm run dev
# → http://localhost:4000

# Terminal 2 — UI (already proxies /api to :4000)
cd apps/ui
npm install
npm run dev
# → http://localhost:5173
```

### Build for production

```bash
cd apps/ui
npm run build
# → dist/ is a static bundle ready for any hosting provider
```

---

## The Demo Flow

Navigate to `http://localhost:5173/demo` to run the guided 10-step judge demo:

| Step | Screen | What happens |
|------|--------|--------------|
| 1 | Verify | Pre-filled form with the Org Billing scenario |
| 2 | Verify | Git verdict strip highlighted ("Everything looks safe") |
| 3 | Analysis | 5 Bob agents animate with real findings |
| 4 | Graph | Conflict map revealed — nodes pulse |
| 5 | Graph | Conflict node highlighted |
| 6 | Detail | Full evidence chain displayed |
| 7 | Detail | Bob resolution accepted |
| 8 | Passport | 43/43 tests — regression test added |
| 9 | Passport | Full Change Passport PASS |
| 10 | Done | Restart CTA |

**Narration cue at step 2:**  
> *"Everything looks safe."*

**Narration cue at step 6:**  
> *"Git understood the text. MergeMind understood the intent."*

**Closing line:**  
> *"Git tells developers whether code can merge. MergeMind tells AI agents whether their decisions can coexist."*

---

## Three Conflict Classes

### 1 — Business-rule conflict
Two agents interpret a requirement differently.  
*Example: Auth assigns `role="owner"`, Billing checks `role==="admin"`.*

### 2 — Contract conflict
One component changes something another depends on.  
*Example: API returns `userId`, Frontend expects `user_id`.*

### 3 — Dependency conflict
One change invalidates an assumption elsewhere.  
*Example: Email made optional in DB, Notification service assumes every user has email.*

---

## Branches Merged

| Branch | Contributor | What it provides |
|--------|------------|-----------------|
| `main` | Zeyad | Repository scaffold + README |
| `abd0zDev` | Abd0z | Monorepo structure, domain models, tRPC API skeleton, git-ingest |
| `amr` | Amr | Ingestion package (dist) |
| `ziad-conflict-graph-ui` | Zeyad | Complete React UI — all 5 screens + demo flow + design system |
| `hassan-dev` | Hassan | Semantic engine — extraction, normalization, conflict detection |

---

## IBM Bob Integration

The analysis pipeline is designed for direct IBM Bob subagent execution:

```
Intent Agent      → extracts business rules from the feature request
Change Agent      → analyzes introduced behavior in each diff
Contract Agent    → inspects API signatures, schemas, and data contracts
Dependency Agent  → traces which modules depend on changed assumptions
Adversary Agent   → challenges internal consistency across all agents
```

In the hackathon MVP, the deterministic semantic engine fills this role without LLM calls. The `AgentRunner` interface in the analysis package is the extension point for real Bob subagents.

---

*MergeMind — IBM TechXchange Hackathon 2024*  
*Powered by IBM Bob*
