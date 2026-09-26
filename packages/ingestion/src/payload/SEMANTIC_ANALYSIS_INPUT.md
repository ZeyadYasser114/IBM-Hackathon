# SemanticAnalysisInput — Consumer Guide

> **Audience:** Awsemy's semantic engine and any other downstream analyzer that consumes the MergeMind ingestion handoff payload.

---

## What this payload is

`SemanticAnalysisInput` is the **final, read-only handoff** from the ingestion layer to the semantic analysis engine.  
It packages everything the engine needs in one JSON-serializable structure:

| Section | Purpose |
|---|---|
| `requirement` | The ground-truth feature/task text the developer requested |
| `changeSets` | Raw diff data from every branch or agent task |
| `evidenceSnippets` | Pre-extracted, deduplicated code constructs sorted by structural priority |
| `repositorySummary` | Aggregated scope metadata (directories, languages, symbols, priority) |
| `sourceLabels` | Human-readable names for each branch / agent |
| `ingestionWarnings` | Non-fatal issues from the diff ingestion phase |
| `truncationWarnings` | Evidence that was trimmed to fit size limits — **must be surfaced in output** |

---

## Consumption algorithm

### Step 1 — Check for truncation warnings first

```
if payload.truncationWarnings is non-empty:
    record each warning in the engine's output
    reduce confidence scores for areas where evidence was dropped
```

If `SNIPPET_BUDGET_EXCEEDED` appears, some code constructs were not included.  
If `REQUIREMENT_TRUNCATED` appears, the requirement text was cut — treat analysis as partial.

---

### Step 2 — Load the requirement

```
requirement = payload.requirement          // may be empty string
title       = payload.requirementTitle     // display only
```

Every assumption you extract and every conflict you identify **must be evaluated against `requirement`**.  
If `requirement` is empty, note this and flag all findings as low-confidence.

---

### Step 3 — Identify the ChangeSets (branches / agents)

```
for each cs in payload.changeSets:
    label = find sourceLabel where label.ref matches cs.source.headRef
            OR where label.id matches cs.id
    
    note: cs.id is the authoritative identifier for back-references
```

Each `ChangeSet` is one independently developed set of changes.  
Treat each one as a separate "voice" making its own assumptions.  
The engine's job is to compare those voices against each other and against `requirement`.

---

### Step 4 — Extract assumptions from evidenceSnippets

```
for each snippet in payload.evidenceSnippets:
    cs      = find changeSet where cs.id == snippet.changeSetId
    label   = sourceLabel for cs

    analyze snippet.content for assumptions
    tag each assumption with:
        - snippet.id         (cite this in your output)
        - snippet.changeSetId
        - snippet.filePath
        - snippet.sourceType  ("function" | "type-decl" | "constant" | "route" | ...)
        - snippet.diffRelation ("added" | "removed" | "context" | "surrounding")
```

**Priority order for analysis** (match `snippet.sourceType`):

| sourceType | Why it matters |
|---|---|
| `type-decl` | Interfaces, enums, and type aliases define shared contracts |
| `function` | Function bodies contain behavioral assumptions |
| `route` | API routes expose external contracts |
| `constant` | Named constants (roles, permissions) carry shared assumptions |
| `diff-context` | Surrounding unchanged code — provides context only |
| `unknown` | Cannot be classified — analyze defensively |

Focus on **`added`** and **`removed`** relations first — these are the actual changes.  
Use **`surrounding`** snippets as context to understand what the change lives inside.

---

### Step 5 — Use repositorySummary for scope

```
summary = payload.repositorySummary

high_risk_signals = summary.analysisPriority == "high"
reasons           = summary.priorityReasons

focus_areas = summary.allTouchedSymbols     // functions/types/constants changed
              + summary.allTouchedSchemaNames // interfaces/enums changed
              + summary.touchedDirectories    // directories affected
```

`priorityReasons` explains **why** the priority was assigned — each reason maps to an observable fact, not a conclusion. Use them to guide which areas to scrutinize most.

---

### Step 6 — Compare assumptions across ChangeSets

For each pair of ChangeSets `(A, B)`:

1. Find snippets where `snippet.changeSetId == A.id` and `snippet.changeSetId == B.id` that touch the **same symbol or file**.
2. Compare the assumptions each snippet implies about shared names (roles, field names, API shapes).
3. If assumptions differ, produce a conflict record that cites:
   - The exact `snippet.id` from each ChangeSet
   - The `filePath` from each ChangeSet
   - The requirement text that was violated

---

### Step 7 — Structure your output

Your output **must** include:

```json
{
  "payloadId": "<echo back payload.payloadId>",
  "changeSetIds": ["<cs1.id>", "<cs2.id>"],
  "assumptions": [
    {
      "id":           "<your generated id>",
      "changeSetId":  "<which cs introduced this>",
      "snippetId":    "<snippet.id this was extracted from>",
      "statement":    "<plain-text assumption, no conclusions>",
      "filePath":     "<source file>",
      "symbol":       "<symbol name if applicable>"
    }
  ],
  "conflicts": [
    {
      "id":             "<your generated id>",
      "assumptionIds":  ["<id-a>", "<id-b>"],
      "description":    "<what disagrees>",
      "severity":       "high | medium | low",
      "requirementRef": "<quote from requirement that is violated>"
    }
  ],
  "truncationWarningsEchoed": ["<codes from payload.truncationWarnings>"]
}
```

---

## Invariants the engine can rely on

| Invariant | Guarantee |
|---|---|
| `payloadId` is unique | UUID v4 — safe to use as a correlation key |
| `schemaVersion` is `"1.0"` | Any breaking change will bump the major version |
| `evidenceSnippets` are sorted | By `filePath` → `startLine` → `id` |
| `changeSets` are sorted | By `id` alphabetically |
| `sourceLabels` are sorted | By `id` alphabetically |
| No semantic conclusions in payload | All fields are structural facts only |
| `snippet.content` is verbatim | Never summarized, never modified |
| `snippet.id` is deterministic | Same code always gets the same id across runs |
| Dropped evidence is never silent | Every dropped item has a `truncationWarning` |

---

## Size limits (defaults, overridable by caller)

| Limit | Default |
|---|---|
| `maxRequirementChars` | 8,000 characters |
| `maxSnippets` | 200 snippets |
| `maxFileSummaries` | 100 file summaries |

When limits are exceeded, `truncationWarnings` lists what was removed.  
High-priority snippets (`type-decl`, `function`, `route`, `constant`) are always kept before `diff-context` snippets.

---

## What the engine must NOT do

- Do not add fields to the payload — it is read-only input.
- Do not invent evidence that is not in the payload.
- Do not output AI-provider-specific fields.
- Do not claim a conflict without citing a `snippet.id` from each side.
- Do not suppress `truncationWarnings` — always echo them in your output.
