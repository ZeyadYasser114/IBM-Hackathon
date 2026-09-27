# MCP Verification via Real Bob Session

## Task

Prove a real IBM Bob session can discover the MergeMind MCP server, invoke
`verify_text_changes`, and receive the structured deterministic verdict.

## Setup

- `.bob/mcp.json` registered via `bob mcp add mergemind node -s workspace -- ./packages/mcp-server/dist/index.js`
- `packages/mcp-server` built (`dist/index.js` present)
- Bob Shell authenticated (per-session key in process env only, never stored)

## Command (run from the repo root)

```text
bob run --format json --max-cost 1.0 --trust < prompt.txt
```

Prompt asked Bob to list MCP tools, invoke `verify_text_changes` once with the
owner-vs-admin killer input, and report tools seen, verdict, and first conflict.

## Result (2026-09-27, task_id d078e846ebdce85479ec016bc0f5f3ba)

```json
{
  "type": "result",
  "timestamp": "2026-09-27T11:25:08.912Z",
  "status": "success",
  "stats": {
    "task_id": "d078e846ebdce85479ec016bc0f5f3ba",
    "duration_ms": 6644,
    "session_costs": 0.048044,
    "max_cost": 1,
    "tool_calls": 1
  },
  "last_message": "TOOLS-SEEN: verify_text_changes, verify_github_repository\nVERDICT: CONFLICTS_FOUND\nFIRST-CONFLICT: Authorization contradiction on 'user_role'"
}
```

## Conclusion

- Bob discovered both MergeMind tools (`verify_text_changes`, `verify_github_repository`)
- Bob invoked `verify_text_changes` (exactly 1 tool call, no other tools touched)
- MergeMind executed the deterministic engine and returned `CONFLICTS_FOUND`
  with `Authorization contradiction on 'user_role'` (BUSINESS_RULE/HIGH)
- Total cost 0.048 Bobcoins; no API keys or secrets involved in this file
