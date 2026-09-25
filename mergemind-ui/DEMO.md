# MergeMind — Judge Demo Guide

> **Branch:** `feature/ziad-conflict-graph-ui`  
> **Estimated run time:** ~2 minutes  
> **Prerequisite:** Node 18+ installed

---

## Quick Start

```bash
cd mergemind-ui
npm install
npm run dev
```

Open **http://localhost:5173/demo** in your browser.  
The app redirects automatically to `/demo/verify` — the first story beat.

---

## What the Demo Shows

The demo walks through a single pre-built scenario:

> **Requirement:** Only organization owners can manage subscriptions.  
> **Authentication team wrote:** `ORG_PRIVILEGED_ROLE = 'owner'`  
> **Billing team wrote:** `if (user.role === 'admin') { … }`  
> **Git says:** Clean merge, 42/42 tests pass.  
> **MergeMind says:** HIGH-severity semantic conflict — the ideas disagree.

---

## Story Beats (10 steps, narrated below)

| Step | Screen | What to say |
|------|--------|-------------|
| **1 — Select change** | `/demo/verify` | "Two Bob agents each wrote half of the feature. Git will merge them cleanly — but do the ideas agree?" |
| **2 — Git shows clean** | same | Click **🤖 Verify with Bob**. The Git verdict strip highlights green. "Git is happy. 42 tests pass. Code compiles. Everything looks safe." |
| **3 — Bob analysis** | `/demo/analysis` | Press **Next →**. Five agents animate in. Auto-advances when done. "Five parallel subagents inspect requirements, contracts, and semantics." |
| **4 — Conflict graph** | `/demo/graph` | The graph appears. After 1.4 s the conflict diamond pulses automatically. "The graph shows a collision between two assumptions." |
| **5 — Highlight conflict** | same | The conflict row fades in below the graph. "Click the diamond or the row to inspect the evidence." |
| **6 — Evidence** | `/demo/detail` | Click **Inspect evidence →**. Full detail panel appears. "97 % confidence. `roles.ts` says owner; `permissions.ts` checks for admin." |
| **7 — Resolution** | same | Click **✓ Accept resolution**. Simulated fix applies in 1.4 s. "Bob rewrites the billing guard and adds a regression test." |
| **8 — 43/43 tests** | `/demo/passport` | Press **View Change Passport →**. The `43/43` callout is the first thing visible. "42 original tests plus the new one = 43 passing." |
| **9 — Passport** | same | Scroll down the PASS passport card. "The Change Passport is a serialisable, auditable record of the full verification." |
| **10 — Done** | same | Press **Next →** one final time. "Git merges text. MergeMind merges ideas." Click **↓ Export JSON** to download the passport. |

---

## Controls

| Control | Action |
|---------|--------|
| **Next →** (DemoBar, bottom-right) | Advance to the next story beat |
| **↺** (DemoBar, bottom-right) | Restart the demo from step 1 |
| **↺ Restart demo** (final screen) | Same — restart from step 1 |
| **↓ Export JSON** (passport screen) | Download `mergemind-passport-*.json` |

---

## Non-demo Routes

The regular routes (`/`, `/analysis`, `/graph`, `/detail`, `/passport`) are fully explorable outside the demo flow. They include a scenario selector on the graph screen and a variant selector on the passport screen.

---

## Swapping in the Real Engine

All demo data flows through a single adapter file:

```
mergemind-ui/src/adapters/semanticAdapter.ts
```

Once Awsemy's semantic engine merges, replace only that file.  
No screen components, no fixture files, and no test files need to change.

The typed interfaces the adapter must satisfy are in:

```
mergemind-ui/src/types/semantic.ts
```

---

## Running Tests

```bash
npm test          # 107 tests across 4 suites
npm run typecheck # zero errors expected
npm run build     # production bundle ~263 kB JS
```
