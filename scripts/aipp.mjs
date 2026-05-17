#!/usr/bin/env node
/**
 * aipp — AI Project Planner CLI
 *
 * A thin command-line client for the planner's HTTP MCP server. The planner's
 * REST API is cookie/session-auth only; the `aipp_` API key authenticates the
 * MCP endpoint exclusively, so this CLI speaks MCP over Streamable HTTP via the
 * official @modelcontextprotocol/sdk (which handles the session handshake that
 * raw curl cannot).
 *
 * Auth resolution order for the API key:
 *   1. --key <key>
 *   2. $AIPP_API_KEY
 *   3. the `ai-project-planner` server entry in this repo's .mcp.json
 *
 * URL resolution: --url, then $AIPP_URL, then .mcp.json, then the known prod URL.
 *
 * Usage:
 *   node scripts/aipp.mjs tools                       # list all tool names
 *   node scripts/aipp.mjs schema <tool>               # show one tool's input schema
 *   node scripts/aipp.mjs call <tool> '<jsonArgs>'    # invoke a tool
 *   node scripts/aipp.mjs whoami                      # dashboard summary (reveals account)
 *
 * Examples:
 *   node scripts/aipp.mjs call list_projects '{"brief":true}'
 *   node scripts/aipp.mjs call update_project '{"projectId":"...","status":"active"}'
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_URL = 'https://ai-project-planner-one.vercel.app/mcp';

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function fromMcpJson() {
  try {
    const cfg = JSON.parse(readFileSync(join(REPO_ROOT, '.mcp.json'), 'utf8'));
    const s = cfg?.mcpServers?.['ai-project-planner'];
    const auth = s?.headers?.Authorization || '';
    return { url: s?.url, key: auth.replace(/^Bearer\s+/i, '') || undefined };
  } catch {
    return {};
  }
}

function resolveAuth() {
  const fileCfg = fromMcpJson();
  const key = arg('--key') || process.env.AIPP_API_KEY || fileCfg.key;
  const url = arg('--url') || process.env.AIPP_URL || fileCfg.url || DEFAULT_URL;
  if (!key) {
    console.error('No API key. Pass --key, set AIPP_API_KEY, or add it to .mcp.json');
    process.exit(2);
  }
  return { key, url };
}

async function connect() {
  const { key, url } = resolveAuth();
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
  });
  const client = new Client({ name: 'aipp-cli', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

function printResult(r) {
  // MCP tool results: { content: [{type:'text',text}], ... }
  if (r?.content?.length) {
    for (const c of r.content) {
      if (c.type === 'text') {
        try {
          console.log(JSON.stringify(JSON.parse(c.text), null, 2));
        } catch {
          console.log(c.text);
        }
      } else {
        console.log(JSON.stringify(c));
      }
    }
  } else {
    console.log(JSON.stringify(r, null, 2));
  }
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log('aipp <tools|schema <tool>|call <tool> [jsonArgs]|whoami>');
    process.exit(0);
  }

  const client = await connect();
  try {
    if (cmd === 'tools') {
      const { tools } = await client.listTools();
      for (const t of tools) console.log(`${t.name}\t${(t.description || '').slice(0, 100)}`);
      console.log(`\n${tools.length} tools`);
    } else if (cmd === 'schema') {
      const name = process.argv[3];
      const { tools } = await client.listTools();
      const t = tools.find((x) => x.name === name);
      if (!t) {
        console.error(`tool not found: ${name}`);
        process.exit(1);
      }
      console.log(JSON.stringify(t.inputSchema, null, 2));
    } else if (cmd === 'call') {
      const name = process.argv[3];
      let args = {};
      const raw = process.argv[4];
      if (raw && raw !== '--key' && raw !== '--url') args = JSON.parse(raw);
      const res = await client.callTool({ name, arguments: args });
      printResult(res);
    } else if (cmd === 'whoami') {
      const res = await client.callTool({ name: 'get_dashboard', arguments: {} });
      printResult(res);
    } else {
      console.error(`unknown command: ${cmd}`);
      process.exit(1);
    }
  } finally {
    await client.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error('ERROR:', e?.message || e);
  process.exit(1);
});
