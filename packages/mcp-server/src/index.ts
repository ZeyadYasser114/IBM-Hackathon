/**
 * @mergemind/mcp-server — MergeMind verification as MCP tools for IBM Bob.
 *
 * Exposes the real deterministic verification pipeline over stdio so Bob
 * (IDE or Shell) can call it as a tool:
 *
 *   verify_text_changes     — verify two caller-supplied changes (no network)
 *   verify_github_repository — clone a public GitHub repo and verify two refs
 *
 * Findings always come from the semantic engine — nothing is invented.
 * Configure in Bob IDE via its MCP settings with:
 *
 *   { "mcpServers": { "mergemind": { "command": "node",
 *       "args": ["<repo>/packages/mcp-server/dist/index.js"] } } }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { verifyChanges, verifyGitHubRepository } from './verify.js';

export { verifyChanges, verifyGitHubRepository };
export type { TextChange, VerificationOutcome, GitHubVerifyOptions } from './verify.js';

const server = new McpServer({ name: 'mergemind-verification', version: '0.1.0' });

const textChangeSchema = z.object({
  label: z.string().describe('Branch or change label, e.g. feature/auth-roles'),
  content: z.string().describe('Change content or unified diff text'),
  filePath: z.string().optional().describe('Repository-relative file path for evidence'),
});

server.registerTool(
  'verify_text_changes',
  {
    description:
      'Verify whether two code changes agree semantically with a requirement. ' +
      'Uses MergeMind deterministic engine. Returns PASS or CONFLICTS_FOUND with evidence.',
    inputSchema: {
      requirementText: z.string().describe('Original feature requirement'),
      changeA: textChangeSchema,
      changeB: textChangeSchema,
    },
  },
  async ({ requirementText, changeA, changeB }) => {
    const outcome = await verifyChanges(`mcp-${Date.now()}`, requirementText, changeA, changeB);
    return { content: [{ type: 'text' as const, text: JSON.stringify(outcome, null, 2) }] };
  },
);

server.registerTool(
  'verify_github_repository',
  {
    description:
      'Clone a public GitHub repository and verify two branches/commits against ' +
      'a base branch. Reads diffs as text only — repository code is never executed. ' +
      'Only https://github.com URLs are accepted.',
    inputSchema: {
      repository: z.string().describe('Public GitHub URL, e.g. https://github.com/owner/repo'),
      baseBranch: z.string().optional().describe('Base branch (default: main)'),
      changeA: z.string().describe('First branch or commit'),
      changeB: z.string().describe('Second branch or commit'),
      featureRequest: z.string().describe('Original feature requirement'),
    },
  },
  async ({ repository, baseBranch, changeA, changeB, featureRequest }) => {
    const outcome = await verifyGitHubRepository(`mcp-${Date.now()}`, {
      repository,
      ...(baseBranch !== undefined ? { baseBranch } : {}),
      changeA,
      changeB,
      featureRequest,
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify(outcome, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
