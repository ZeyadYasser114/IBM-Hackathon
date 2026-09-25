# MergeMind UI

Visual presentation layer for the MergeMind semantic conflict detection system.

## What this is

This package is **Ziad's workstream** — the product presentation layer only.  
It does **not** implement: semantic detection, Git ingestion, Bob orchestration backend, or branch-merging logic.

## Screens

| Route | Screen | Purpose |
|---|---|---|
| `/` | Verify Change | Developer enters repo, feature request, and two branches |
| `/analysis` | Bob Analysis | Live agent progress — 5 parallel Bob subagents |
| `/graph` | Conflict Graph | SVG semantic conflict map + conflict list |
| `/detail` | Conflict Detail | Full assumption breakdown + Bob-proposed resolution |
| `/passport` | Change Passport | Permanent verification record |

## Demo fixture

The first demo fixture models the **owner vs admin role conflict**:

- **Requirement:** Only organization owners can manage subscriptions.
- **Auth change:** `privileged role = "owner"` (`auth/roles.ts`)
- **Billing change:** `privileged role = "admin"` (`billing/permissions.ts`)
- **Result:** 1 HIGH-severity BUSINESS_RULE conflict — Git shows clean merge, MergeMind catches it.

## Integration seam

`src/adapters/semanticAdapter.ts` is the **only file** that needs to change when Awsemy's engine is merged.  
It exposes:

```ts
startAnalysis(input: VerifyChangeInput): Promise<string>
getSession(sessionId: string, progressStep: number): Promise<AnalysisSession>
getCompletedSession(sessionId: string): Promise<AnalysisSession>
```

Today these return `DEMO_SESSION`. Post-merge they hit the real engine with the same return shapes.

## Tech stack

- React 18 + TypeScript (strict)
- React Router v6
- Vite 5
- Zero runtime UI library — pure CSS design system in `src/styles/global.css`
- Pure SVG conflict graph (no graph library dependency)

## Development

```bash
cd mergemind-ui
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # type-check only
npm run build      # production build
```

## File map

```
src/
  types/
    semantic.ts           ← ALL shared TypeScript interfaces
  data/
    demoFixtures.ts       ← owner/admin demo scenario
  adapters/
    semanticAdapter.ts    ← integration seam (replace for real engine)
  components/
    Layout.tsx            ← top bar + breadcrumb nav + footer
    StatusBadge.tsx       ← SeverityBadge, StatusBadge, AgentStatusBadge
    AgentProgress.tsx     ← animated Bob agent list
    GraphCanvas.tsx       ← pure SVG conflict graph
  pages/
    VerifyChange.tsx      ← Screen 1
    Analysis.tsx          ← Screen 2
    ConflictGraph.tsx     ← Screen 3
    ConflictDetail.tsx    ← Screen 4
    ChangePassport.tsx    ← Screen 5
  styles/
    global.css            ← design system (dark, IBM-aligned palette)
```
