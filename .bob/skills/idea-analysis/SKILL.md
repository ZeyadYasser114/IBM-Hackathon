---
name: idea-analysis
description: Deeply analyze a project idea before any implementation starts. Use this when the user proposes a new feature, product, or project and wants it understood, scoped, and stress-tested (problem, users, workflow, solution, value, differentiation, feasibility, risks, MVP scope) BEFORE any code is written. This is an analysis-only workflow — it never writes, edits, deletes, or refactors project files, and never begins implementation.
---

# Pre-Development Idea Analysis

## Purpose

Produce a single structured analysis document that lets the team deeply
understand a project idea and make informed go/no-go and scoping decisions
**before any implementation begins**. This skill is the discovery/diligence
gate that precedes planning and coding, not a replacement for them.

## Hard restrictions (non-negotiable)

While this skill is active, Bob MUST NOT:
- Write, generate, or scaffold application code
- Modify, refactor, or delete any existing project file
- Create implementation files of any kind (configs, migrations, schemas, etc.)
- Begin, simulate, or scope out actual MVP construction beyond naming what
  it *would* include
- Make or record irreversible architectural or technology decisions

Bob MAY: read the existing codebase (if any) for context, search the web
for competitor/market/precedent research, ask the user clarifying
questions, and write **one output artifact**: the analysis document itself.

If, mid-analysis, the user asks Bob to start building, editing code, or
making implementation decisions, Bob should decline within this skill and
tell the user to exit idea-analysis and switch to a planning/build workflow
first.

## Workflow

1. **Gather the idea.** Read whatever the user has provided (a prompt, a
   doc, an existing partial codebase). If the idea is vague or a section
   below can't be reasonably inferred, ask the user directly rather than
   inventing specifics — but don't block on every gap; note real gaps in
   "Missing Information" instead of stalling the whole analysis.
2. **Research, don't assume.** For "Existing or Similar Solutions" and any
   claims about the market, competitors, or prior art, use web search.
   Do not present assumed competitor behavior as fact.
3. **Draft the full analysis** using `templates/analysis-template.md` (in
   this skill directory) as the section structure. Every section must be
   filled in — use "Unknown — needs input from team" rather than skipping
   a section.
4. **Distinguish fact from assumption.** Anything not confirmed by the
   user or by research goes in "Assumptions," not silently into the
   proposed-solution narrative.
5. **Be critical, not promotional.** Risks, weaknesses, and unanswered
   questions are the most valuable part of this document — do not soften
   them into vague positives. Give a direct, concrete evaluation.
6. **Save the output** as `docs/idea-analysis/<short-idea-slug>.md` in the
   project using the `write_file` tool (creating that one new analysis file
   is the only file operation this skill performs). Present it to the user
   for team review.

## Required sections (in order)

1. Problem Definition
2. Target Users
3. Existing Workflow (how this is handled today, without the idea)
4. Proposed Solution
5. User Journey
6. Core Value
7. Innovation / Differentiation
8. Existing or Similar Solutions (researched, with sources)
9. Technical Feasibility
10. Relevant Bob Capabilities (what Bob could realistically help with here —
    e.g. codegen, refactors, test generation, docs — stated generally, not
    as a build plan)
11. Possible Agents, Tools, MCPs, and Other Skills (what integrations or
    Bob skills would plausibly be relevant later — informational only)
12. Assumptions
13. Risks and Weaknesses
14. Missing Information
15. Open Questions for the Team
16. Possible MVP Scope (a bullet list of *candidate* scope — explicitly
    not a commitment or a build order)
17. What Should NOT Be Implemented Yet

Use `templates/analysis-template.md` verbatim as the section skeleton so
output is consistent across ideas.

## Output discipline

- No source code, pseudocode implementation, or file scaffolding anywhere
  in the output — diagrams/flow descriptions in prose or Mermaid are fine
  for the User Journey section.
- Keep each section tight and specific to this idea — no generic
  boilerplate advice.
- End the document with a short "Recommended Next Step" line (e.g.
  "resolve open questions #2 and #4, then move to planning") — this is a
  recommendation, not an action Bob takes.
