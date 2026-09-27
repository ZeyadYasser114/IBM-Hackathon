/**
 * server.test.ts — MCP protocol tests over stdio against the built server.
 *
 * Spawns `node dist/index.js` (built by `pnpm build`, which runs before
 * `pnpm test` via the root pretest) and drives it with a real SDK client:
 * initialization, tools/list, tool invocation, and error paths.
 *
 * No network access (verify_text_changes only), no Bob CLI, no API keys.
 * verify_github_repository is covered at the runner level in verify.test.ts
 * because it clones remote repositories.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER_PATH = fileURLToPath(new URL('../dist/index.js', import.meta.url));

const PROTOCOL_TIMEOUT_MS = 60000;

const KILLER_ARGS = {
  requirementText: 'Only organization owners can manage subscriptions.',
  changeA: {
    label: 'feature/auth-roles',
    content: `export const ORG_PRIVILEGED_ROLE = 'owner';`,
    filePath: 'auth/roles.ts',
  },
  changeB: {
    label: 'feature/billing-permissions',
    content: `if (user.role === 'admin') { return manageSubscription(); }`,
    filePath: 'billing/permissions.ts',
  },
};

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type?: unknown; text?: unknown }> }).content;
  const first = Array.isArray(content) ? content[0] : undefined;
  if (!first || first.type !== 'text' || typeof first.text !== 'string') {
    throw new Error('expected a single text content item');
  }
  return first.text;
}

describe('MCP server', () => {
  let client: Client;

  beforeAll(async () => {
    if (!existsSync(SERVER_PATH)) {
      throw new Error(`MCP server not built — run "pnpm build" first (${SERVER_PATH})`);
    }
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER_PATH],
    });
    client = new Client({ name: 'mergemind-test', version: '0.0.0' }, { capabilities: {} });
    await client.connect(transport);
  }, 30000);

  afterAll(async () => {
    await client?.close();
  });

  it('lists both verification tools with required parameters', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['verify_github_repository', 'verify_text_changes']);

    const textTool = tools.find((t) => t.name === 'verify_text_changes');
    expect(textTool?.description).toContain('semantic');
    const textRequired = (textTool?.inputSchema as { required?: string[] })?.required ?? [];
    expect(textRequired).toEqual(expect.arrayContaining(['requirementText', 'changeA', 'changeB']));

    const githubTool = tools.find((t) => t.name === 'verify_github_repository');
    const githubRequired = (githubTool?.inputSchema as { required?: string[] })?.required ?? [];
    expect(githubRequired).toEqual(
      expect.arrayContaining(['repository', 'changeA', 'changeB', 'featureRequest']),
    );
    expect(githubRequired).not.toContain('baseBranch');
  });

  it(
    'verifies the killer example with exactly one HIGH conflict',
    async () => {
      const result = await client.callTool({ name: 'verify_text_changes', arguments: KILLER_ARGS });
      const outcome = JSON.parse(textOf(result)) as {
        status: string;
        conflictsFound: number;
        reports: Array<{ conflictType: string; severity: string; affectedFiles: string[] }>;
      };
      expect(outcome.status).toBe('CONFLICTS_FOUND');
      expect(outcome.conflictsFound).toBe(1);
      expect(outcome.reports[0]?.conflictType).toBe('BUSINESS_RULE');
      expect(outcome.reports[0]?.severity).toBe('HIGH');
      expect(outcome.reports[0]?.affectedFiles).toEqual(
        expect.arrayContaining(['auth/roles.ts', 'billing/permissions.ts']),
      );
    },
    PROTOCOL_TIMEOUT_MS,
  );

  it('is deterministic across identical calls', async () => {
    const first = JSON.parse(
      textOf(await client.callTool({ name: 'verify_text_changes', arguments: KILLER_ARGS })),
    ) as { status: string; conflictsFound: number };
    const second = JSON.parse(
      textOf(await client.callTool({ name: 'verify_text_changes', arguments: KILLER_ARGS })),
    ) as { status: string; conflictsFound: number };
    expect(second.status).toBe(first.status);
    expect(second.conflictsFound).toBe(first.conflictsFound);
  });

  it('rejects missing required parameters', async () => {
    const result = await client.callTool({
      name: 'verify_text_changes',
      arguments: { changeA: KILLER_ARGS.changeA, changeB: KILLER_ARGS.changeB },
    });
    expect((result as { isError?: boolean }).isError).toBe(true);
  });

  it('rejects unknown tools', async () => {
    const result = await client.callTool({ name: 'no_such_tool', arguments: {} });
    expect((result as { isError?: boolean }).isError).toBe(true);
  });
});
